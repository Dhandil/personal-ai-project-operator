import { isAbsolute, join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";

import type {
  AgentCleanupResult,
  AgentControlRequest,
  AgentControlResult,
  AgentEvent,
  AgentFailure,
  AgentOutput,
  AgentResult,
  AgentResumeRequest,
  AgentRuntime,
  AgentSession,
  AgentStartRequest,
  ExecutionId,
  GoalId,
  TaskId,
  UtcIsoTimestamp,
} from "@personal-ai-operator/contracts";
import {
  agentSessionPolicies,
  isFormalId,
} from "@personal-ai-operator/contracts";

import { AgentRuntimeValidationError } from "./agent-runtime-port.js";
import {
  buildClaudeProjectPurgeArgs,
  buildClaudeResumeArgs,
  buildClaudeStartArgs,
  type ClaudeCliArgsOptions,
  type ClaudeCommand,
  type ClaudeOutputFormat,
} from "./claude-cli-args.js";
import {
  ClaudeJsonParseError,
  ClaudeJsonParser,
  projectClaudeRecord,
  type ClaudeEventProjection,
} from "./claude-json-parser.js";
import {
  spawnClaudeProcess,
  type ClaudeProcess,
  type ClaudeProcessFactory,
} from "./claude-process.js";
import { RuntimeDirectoryCleaner } from "./runtime-directory-cleaner.js";

export type ClaudeCodeAdapterOptions = Readonly<{
  readonly executable?: string;
  readonly now?: () => UtcIsoTimestamp;
  readonly processFactory?: ClaudeProcessFactory;
  readonly outputFormat?: ClaudeOutputFormat;
  readonly jsonSchema?: Readonly<Record<string, unknown>>;
  readonly runtimeDirectoryRoot?: string;
  readonly allowProjectPurge?: boolean;
}>;

function defaultExecutable(): string {
  if (process.platform === "win32") {
    const candidate = join(
      process.env.APPDATA ?? "",
      "npm",
      "node_modules",
      "@anthropic-ai",
      "claude-code",
      "bin",
      "claude.exe",
    );
    if (existsSync(candidate)) return candidate;
  }
  return "claude";
}

type ClaudeExecutionState = {
  readonly executionId: ExecutionId;
  readonly events: AsyncEventQueue<AgentEvent>;
  sequence: number;
  sessionId: string | null;
};

type ClaudeExecution = {
  readonly executionId: ExecutionId;
  readonly request: AgentStartRequest;
  process: ClaudeProcess;
  state: ClaudeExecutionState;
  status: "running" | AgentResult["status"];
  cancelRequested: boolean;
  projectPurged: boolean;
};

class AsyncEventQueue<Value> implements AsyncIterable<Value> {
  private readonly values: Value[] = [];
  private readonly waiters: Array<{
    readonly resolve: (result: IteratorResult<Value>) => void;
  }> = [];
  private ended = false;

  public push(value: Value): void {
    const waiter = this.waiters.shift();
    if (waiter !== undefined) {
      waiter.resolve({ done: false, value });
      return;
    }
    this.values.push(value);
  }

  public end(): void {
    this.ended = true;
    while (this.waiters.length > 0)
      this.waiters.shift()?.resolve({ done: true, value: undefined });
  }

  public [Symbol.asyncIterator](): AsyncIterator<Value> {
    return this;
  }

  public next(): Promise<IteratorResult<Value>> {
    const value = this.values.shift();
    if (value !== undefined) return Promise.resolve({ done: false, value });
    if (this.ended) return Promise.resolve({ done: true, value: undefined });
    return new Promise((resolve) => this.waiters.push({ resolve }));
  }
}

function timestamp(): UtcIsoTimestamp {
  return new Date().toISOString() as UtcIsoTimestamp;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isTaskId(value: unknown): value is TaskId {
  return (
    typeof value === "string" && isFormalId(value) && value.startsWith("TASK-")
  );
}

function isGoalId(value: unknown): value is GoalId {
  return (
    typeof value === "string" && isFormalId(value) && value.startsWith("GOAL-")
  );
}

function validateRequest(request: AgentStartRequest): void {
  if (!isTaskId(request.taskId))
    throw new AgentRuntimeValidationError(
      "taskId must be a TASK-### identifier.",
    );
  if (request.goalId !== null && !isGoalId(request.goalId))
    throw new AgentRuntimeValidationError(
      "goalId must be null or a GOAL-### identifier.",
    );
  if (!nonEmpty(request.role) || !nonEmpty(request.prompt))
    throw new AgentRuntimeValidationError("role and prompt are required.");
  if (
    request.sessionPolicy !== undefined &&
    !agentSessionPolicies.includes(request.sessionPolicy)
  )
    throw new AgentRuntimeValidationError(
      "sessionPolicy must be persistent or ephemeral.",
    );
  if (!isAbsolute(request.workingDirectory))
    throw new AgentRuntimeValidationError(
      "workingDirectory must be an absolute task path.",
    );
  if (
    request.runtimeDirectory !== undefined &&
    (!nonEmpty(request.runtimeDirectory) ||
      !isAbsolute(request.runtimeDirectory))
  )
    throw new AgentRuntimeValidationError(
      "runtimeDirectory must be an absolute application runtime path.",
    );
  if (
    !Array.isArray(request.allowedPaths) ||
    !Array.isArray(request.forbiddenPaths) ||
    !request.allowedPaths.every(nonEmpty) ||
    !request.forbiddenPaths.every(nonEmpty)
  )
    throw new AgentRuntimeValidationError(
      "allowedPaths and forbiddenPaths must contain path strings.",
    );
  if (
    !Array.isArray(request.context) ||
    !request.context.every((item) => nonEmpty(item.key) && nonEmpty(item.value))
  )
    throw new AgentRuntimeValidationError(
      "context must contain non-empty key/value items.",
    );
}

function failure(code: AgentFailure["code"], message: string): AgentFailure {
  return { code, message };
}

function commandDescription(command: ClaudeCommand): string {
  return JSON.stringify([command.executable, ...command.args]);
}

function mergeOutput(
  projectionOutput: AgentOutput | null,
  metadata: AgentOutput,
): AgentOutput {
  return { ...(projectionOutput ?? {}), ...metadata };
}

export class ClaudeCodeAdapter implements AgentRuntime {
  private readonly executable: string;
  private readonly now: () => UtcIsoTimestamp;
  private readonly processFactory: ClaudeProcessFactory;
  private readonly argsOptions: ClaudeCliArgsOptions;
  private readonly cleaner: RuntimeDirectoryCleaner;
  private readonly allowProjectPurge: boolean;
  private readonly executions = new Map<ExecutionId, ClaudeExecution>();
  private nextExecutionNumber = 1;

  public constructor(options: ClaudeCodeAdapterOptions = {}) {
    this.executable =
      options.executable ?? process.env.CLAUDE_CLI_PATH ?? defaultExecutable();
    this.now = options.now ?? timestamp;
    this.processFactory = options.processFactory ?? spawnClaudeProcess;
    this.argsOptions = {
      outputFormat: options.outputFormat ?? "stream-json",
      ...(options.jsonSchema === undefined
        ? {}
        : { jsonSchema: options.jsonSchema }),
    };
    this.cleaner = new RuntimeDirectoryCleaner({
      runtimeRoot:
        options.runtimeDirectoryRoot ??
        join(tmpdir(), "personal-ai-operator-runtime"),
    });
    this.allowProjectPurge = options.allowProjectPurge ?? false;
  }

  public async start(request: AgentStartRequest): Promise<AgentSession> {
    validateRequest(request);
    const executionId = this.nextExecutionId();
    const built = buildClaudeStartArgs(request, this.argsOptions);
    const command: ClaudeCommand = { ...built, executable: this.executable };
    const process = await this.processFactory(command);
    const execution: ClaudeExecution = {
      executionId,
      request,
      process,
      state: {
        executionId,
        events: new AsyncEventQueue<AgentEvent>(),
        sequence: 0,
        sessionId: null,
      },
      status: "running",
      cancelRequested: false,
      projectPurged: false,
    };
    this.executions.set(executionId, execution);
    return this.session(execution, this.run(execution, command));
  }

  public async resume(request: AgentResumeRequest): Promise<AgentSession> {
    if (request.startRequest.sessionPolicy === "ephemeral")
      throw new AgentRuntimeValidationError(
        "Ephemeral sessions cannot be resumed.",
      );
    if (request.sessionId.trim().length === 0)
      throw new AgentRuntimeValidationError(
        `Execution ${request.executionId} has no precise session ID.`,
      );
    const existing = this.executions.get(request.executionId);
    if (existing !== undefined && existing.status !== "interrupted")
      throw new AgentRuntimeValidationError(
        `Execution ${request.executionId} is not resumable.`,
      );
    if (
      existing !== undefined &&
      existing.state.sessionId !== request.sessionId
    )
      throw new AgentRuntimeValidationError(
        `Execution ${request.executionId} session does not match the stored session.`,
      );
    validateRequest(request.startRequest);
    const built = buildClaudeResumeArgs(
      request.startRequest,
      request.sessionId,
      this.argsOptions,
    );
    const command: ClaudeCommand = { ...built, executable: this.executable };
    const process = await this.processFactory(command);
    const execution: ClaudeExecution = existing ?? {
      executionId: request.executionId,
      request: request.startRequest,
      process,
      state: {
        executionId: request.executionId,
        events: new AsyncEventQueue<AgentEvent>(),
        sequence: 0,
        sessionId: request.sessionId,
      },
      status: "running",
      cancelRequested: false,
      projectPurged: false,
    };
    execution.process = process;
    execution.state.sessionId = request.sessionId;
    execution.status = "running";
    execution.cancelRequested = false;
    this.executions.set(request.executionId, execution);
    this.reserveExecutionId(request.executionId);
    return this.session(execution, this.run(execution, command));
  }

  public async cancel(
    request: AgentControlRequest,
  ): Promise<AgentControlResult> {
    const execution = this.executions.get(request.executionId);
    if (execution === undefined)
      return {
        ok: false,
        code: "not_found",
        executionId: request.executionId,
        message: "Execution does not exist.",
      };
    if (execution.status !== "running")
      return {
        ok: false,
        code: "not_running",
        executionId: request.executionId,
        message: "Execution is not running.",
      };
    execution.cancelRequested = true;
    if (!execution.process.kill("SIGTERM"))
      return {
        ok: false,
        code: "not_running",
        executionId: request.executionId,
        message: "Claude process could not be terminated.",
      };
    return {
      ok: true,
      executionId: request.executionId,
      status: "interrupted",
    };
  }

  public async cleanup(
    request: AgentControlRequest,
  ): Promise<AgentCleanupResult> {
    const execution = this.executions.get(request.executionId);
    if (execution === undefined)
      return {
        ok: false,
        code: "not_found",
        executionId: request.executionId,
        message: "Execution does not exist.",
      };
    if (execution.status === "running")
      return {
        ok: false,
        code: "not_terminal",
        executionId: request.executionId,
        message: "Running executions must be cancelled before cleanup.",
      };
    if (
      execution.request.sessionPolicy !== "ephemeral" &&
      !this.allowProjectPurge
    )
      return {
        ok: false,
        code: "cleanup_failed",
        executionId: request.executionId,
        message:
          "Persistent Claude cleanup requires explicit project-purge permission for a temporary project.",
        retryable: false,
        estimatedFreedBytes: 0,
      };
    if (execution.request.runtimeDirectory !== undefined) {
      const validationError = this.cleaner.validate(
        execution.request.runtimeDirectory,
      );
      if (validationError !== null)
        return {
          ok: false,
          code: "cleanup_failed",
          executionId: request.executionId,
          message: validationError,
          retryable: false,
          estimatedFreedBytes: 0,
        };
    }
    if (
      execution.request.sessionPolicy !== "ephemeral" &&
      !execution.projectPurged
    ) {
      try {
        const command: ClaudeCommand = {
          ...buildClaudeProjectPurgeArgs(execution.request.workingDirectory),
          executable: this.executable,
        };
        const process = await this.processFactory(command);
        const stderr: string[] = [];
        const stdoutTask = (async (): Promise<void> => {
          for await (const chunk of process.stdout) {
            // Project purge has no structured output contract.
            void chunk;
          }
        })();
        const stderrDecoder = new StringDecoder("utf8");
        const stderrTask = (async (): Promise<void> => {
          for await (const chunk of process.stderr) {
            const text = stderrDecoder.write(Buffer.from(chunk as Uint8Array));
            if (text.length > 0) stderr.push(text);
          }
          const tail = stderrDecoder.end();
          if (tail.length > 0) stderr.push(tail);
        })();
        const exit = await process.exit;
        await Promise.all([stdoutTask, stderrTask]);
        if (exit.error !== null || exit.signal !== null || exit.code !== 0)
          throw new Error("Claude project purge failed.");
        execution.projectPurged = true;
      } catch (error) {
        return {
          ok: false,
          code: "cleanup_failed",
          executionId: request.executionId,
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
          estimatedFreedBytes: 0,
        };
      }
    } else {
      execution.projectPurged = true;
    }
    let estimatedFreedBytes = 0;
    if (execution.request.runtimeDirectory !== undefined) {
      const cleaned = await this.cleaner.cleanup(
        execution.request.runtimeDirectory,
      );
      if (!cleaned.ok)
        return {
          ok: false,
          code: "cleanup_failed",
          executionId: request.executionId,
          message: cleaned.message,
          retryable: true,
          estimatedFreedBytes: cleaned.estimatedFreedBytes,
        };
      estimatedFreedBytes = cleaned.estimatedFreedBytes;
    }
    this.executions.delete(request.executionId);
    return {
      ok: true,
      executionId: request.executionId,
      status: "cleaned",
      sessionId: execution.state.sessionId,
      estimatedFreedBytes,
      message:
        execution.request.sessionPolicy === "ephemeral"
          ? "Ephemeral Claude session persistence was disabled."
          : "Claude project state and application runtime directory were cleaned.",
    };
  }

  private session(
    execution: ClaudeExecution,
    result: Promise<AgentResult>,
  ): AgentSession {
    return {
      executionId: execution.executionId,
      get sessionId() {
        return execution.state.sessionId;
      },
      events: execution.state.events,
      result,
    };
  }

  private nextExecutionId(): ExecutionId {
    const number = this.nextExecutionNumber++;
    if (number > 999)
      throw new AgentRuntimeValidationError("Execution ID capacity exceeded.");
    return `EXEC-${String(number).padStart(3, "0")}` as ExecutionId;
  }

  private reserveExecutionId(executionId: ExecutionId): void {
    const match = /^EXEC-(\d{3})$/.exec(executionId);
    if (match !== null)
      this.nextExecutionNumber = Math.max(
        this.nextExecutionNumber,
        Number(match[1]) + 1,
      );
  }

  private append(
    state: ClaudeExecutionState,
    type: AgentEvent["type"],
    message: string,
    data: AgentEvent["data"],
  ): void {
    state.sequence += 1;
    state.events.push({
      executionId: state.executionId,
      sequence: state.sequence,
      occurredAt: this.now(),
      type,
      message,
      data,
    });
  }

  private appendProjection(
    state: ClaudeExecutionState,
    projection: ClaudeEventProjection,
  ): void {
    this.append(state, projection.type, projection.message, projection.data);
  }

  private async run(
    execution: ClaudeExecution,
    command: ClaudeCommand,
  ): Promise<AgentResult> {
    const { request, process, state } = execution;
    const parser = new ClaudeJsonParser();
    const stderrDecoder = new StringDecoder("utf8");
    const stderrChunks: string[] = [];
    const changedFiles = new Set<string>();
    let finalOutput: AgentOutput | null = null;
    let parseFailure: ClaudeJsonParseError | null = null;
    let cliError: string | null = null;
    let records = 0;
    this.append(state, "started", "Claude Code process started.", {
      command: commandDescription(command),
      workingDirectory: request.workingDirectory,
      sandbox: command.permissionMode,
      pid: process.pid ?? null,
    });
    const stdoutTask = (async (): Promise<void> => {
      for await (const chunk of process.stdout) {
        try {
          for (const record of parser.push(chunk as Uint8Array)) {
            records += 1;
            const projection = projectClaudeRecord(record);
            if (projection.sessionId !== null)
              state.sessionId = projection.sessionId;
            projection.changedFiles.forEach((path) => changedFiles.add(path));
            if (projection.output !== null) finalOutput = projection.output;
            if (projection.error !== null) cliError = projection.error;
            this.appendProjection(state, projection);
          }
        } catch (error) {
          parseFailure =
            error instanceof ClaudeJsonParseError
              ? error
              : new ClaudeJsonParseError(String(error), 0);
          return;
        }
      }
      try {
        for (const record of parser.finish()) {
          records += 1;
          const projection = projectClaudeRecord(record);
          if (projection.sessionId !== null)
            state.sessionId = projection.sessionId;
          projection.changedFiles.forEach((path) => changedFiles.add(path));
          if (projection.output !== null) finalOutput = projection.output;
          if (projection.error !== null) cliError = projection.error;
          this.appendProjection(state, projection);
        }
      } catch (error) {
        parseFailure =
          error instanceof ClaudeJsonParseError
            ? error
            : new ClaudeJsonParseError(String(error), 0);
      }
    })();
    const stderrTask = (async (): Promise<void> => {
      for await (const chunk of process.stderr) {
        const text = stderrDecoder.write(Buffer.from(chunk as Uint8Array));
        if (text.length > 0) stderrChunks.push(text);
      }
      const tail = stderrDecoder.end();
      if (tail.length > 0) stderrChunks.push(tail);
    })();
    const exit = await process.exit;
    await Promise.all([stdoutTask, stderrTask]);
    if (records === 0 && parseFailure === null)
      parseFailure = new ClaudeJsonParseError("no JSON events received", 0);
    const stderr = stderrChunks.join("");
    if (stderr.length > 0)
      this.append(state, "error_output", "Claude wrote to stderr.", {
        stderr,
      });
    const metadata: AgentOutput = {
      sessionId: state.sessionId,
      pid: process.pid ?? null,
      command: commandDescription(command),
      workingDirectory: request.workingDirectory,
      permissionMode: command.permissionMode,
      fileChanges: JSON.stringify([...changedFiles]),
      ...(stderr.length > 0 ? { stderr } : {}),
    };
    const diagnostics = [
      `command=${commandDescription(command)}`,
      `workingDirectory=${request.workingDirectory}`,
      ...(stderr.length > 0 ? [`stderr=${stderr}`] : []),
    ];
    let status: AgentResult["status"] = "completed";
    let error: AgentFailure | null = null;
    let message = "Claude Code completed.";
    if (execution.cancelRequested || exit.signal !== null) {
      status = "interrupted";
      message = "Claude Code was cancelled.";
      error = failure("interrupted", message);
    } else if (parseFailure !== null) {
      status = "invalid_output";
      message = parseFailure.message;
      error = failure("malformed_output", message);
    } else if (exit.error !== null || exit.code !== 0) {
      status = "failed";
      message = "Claude Code process failed.";
      error = failure(
        exit.error !== null ? "execution_failed" : "error_output",
        message,
      );
    } else if (cliError !== null) {
      status = "failed";
      message = cliError;
      error = failure("error_output", message);
    }
    execution.status = status;
    this.append(
      state,
      status === "completed"
        ? "completed"
        : status === "invalid_output"
          ? "failed"
          : status,
      message,
      metadata,
    );
    state.events.end();
    return {
      executionId: state.executionId,
      status,
      output: mergeOutput(finalOutput, metadata),
      error,
      diagnostics,
    };
  }
}
