import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { StringDecoder } from "node:string_decoder";

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
  buildCodexDeleteArgs,
  buildCodexExecArgs,
  buildCodexExecResumeArgs,
  type CodexExecArgsOptions,
  type CodexExecCommand,
} from "./codex-exec-args.js";
import {
  CodexJsonlParseError,
  CodexJsonlParser,
  projectCodexRecord,
  type CodexEventProjection,
} from "./codex-jsonl-parser.js";
import {
  spawnCodexProcess,
  type CodexProcess,
  type CodexProcessFactory,
} from "./codex-process.js";
import { RuntimeDirectoryCleaner } from "./runtime-directory-cleaner.js";

export type CodexCliAdapterOptions = Readonly<{
  readonly executable?: string;
  readonly now?: () => UtcIsoTimestamp;
  readonly processFactory?: CodexProcessFactory;
  readonly outputSchemaPath?: string;
  readonly runtimeDirectoryRoot?: string;
}>;

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
    while (this.waiters.length > 0) {
      this.waiters.shift()?.resolve({ done: true, value: undefined });
    }
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

type ExecutionState = {
  readonly executionId: ExecutionId;
  readonly events: AsyncEventQueue<AgentEvent>;
  sequence: number;
  sessionId: string | null;
};

type CodexExecution = {
  readonly executionId: ExecutionId;
  readonly request: AgentStartRequest;
  process: CodexProcess;
  state: ExecutionState;
  status: "running" | AgentResult["status"];
  cancelRequested: boolean;
  sessionDeleted: boolean;
};

function timestamp(): UtcIsoTimestamp {
  return new Date().toISOString() as UtcIsoTimestamp;
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

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateRequest(request: AgentStartRequest): void {
  if (!isTaskId(request.taskId)) {
    throw new AgentRuntimeValidationError(
      "taskId must be a TASK-### identifier.",
    );
  }
  if (request.goalId !== null && !isGoalId(request.goalId)) {
    throw new AgentRuntimeValidationError(
      "goalId must be null or a GOAL-### identifier.",
    );
  }
  if (!nonEmptyString(request.role) || !nonEmptyString(request.prompt)) {
    throw new AgentRuntimeValidationError("role and prompt are required.");
  }
  if (
    request.sessionPolicy !== undefined &&
    !agentSessionPolicies.includes(request.sessionPolicy)
  ) {
    throw new AgentRuntimeValidationError(
      "sessionPolicy must be persistent or ephemeral.",
    );
  }
  if (
    request.runtimeDirectory !== undefined &&
    (!nonEmptyString(request.runtimeDirectory) ||
      !isAbsolute(request.runtimeDirectory))
  ) {
    throw new AgentRuntimeValidationError(
      "runtimeDirectory must be an absolute application runtime path.",
    );
  }
  if (
    !nonEmptyString(request.workingDirectory) ||
    !isAbsolute(request.workingDirectory)
  ) {
    throw new AgentRuntimeValidationError(
      "workingDirectory must be an absolute task Worktree path.",
    );
  }
  if (
    !Array.isArray(request.allowedPaths) ||
    !Array.isArray(request.forbiddenPaths) ||
    !request.allowedPaths.every(nonEmptyString) ||
    !request.forbiddenPaths.every(nonEmptyString)
  ) {
    throw new AgentRuntimeValidationError(
      "allowedPaths and forbiddenPaths must contain path strings.",
    );
  }
  if (
    !Array.isArray(request.context) ||
    !request.context.every(
      (item) => nonEmptyString(item.key) && nonEmptyString(item.value),
    )
  ) {
    throw new AgentRuntimeValidationError(
      "context must contain non-empty key/value items.",
    );
  }
}

function failure(code: AgentFailure["code"], message: string): AgentFailure {
  return { code, message };
}

function commandDescription(command: CodexExecCommand): string {
  return JSON.stringify([command.executable, ...command.args]);
}

function mergeOutput(
  projectionOutput: AgentOutput | null,
  metadata: AgentOutput,
): AgentOutput {
  return { ...(projectionOutput ?? {}), ...metadata };
}

export class CodexCliAdapter implements AgentRuntime {
  private readonly executable: string;
  private readonly now: () => UtcIsoTimestamp;
  private readonly processFactory: CodexProcessFactory;
  private readonly outputSchemaPath: string | undefined;
  private readonly runtimeDirectoryCleaner: RuntimeDirectoryCleaner;
  private readonly executions = new Map<ExecutionId, CodexExecution>();
  private nextExecutionNumber = 1;

  public constructor(options: CodexCliAdapterOptions = {}) {
    this.executable = options.executable ?? "codex";
    this.now = options.now ?? timestamp;
    this.processFactory = options.processFactory ?? spawnCodexProcess;
    this.outputSchemaPath = options.outputSchemaPath;
    this.runtimeDirectoryCleaner = new RuntimeDirectoryCleaner({
      runtimeRoot:
        options.runtimeDirectoryRoot ??
        join(tmpdir(), "personal-ai-project-operator-runtime"),
    });
  }

  public async start(request: AgentStartRequest): Promise<AgentSession> {
    validateRequest(request);
    const executionId = this.nextExecutionId();
    const argsOptions: CodexExecArgsOptions =
      this.outputSchemaPath === undefined
        ? {}
        : { outputSchemaPath: this.outputSchemaPath };
    const built = buildCodexExecArgs(request, argsOptions);
    const command: CodexExecCommand = {
      ...built,
      executable: this.executable,
    };
    const process = await this.processFactory(command);
    const state: ExecutionState = {
      executionId,
      events: new AsyncEventQueue<AgentEvent>(),
      sequence: 0,
      sessionId: null,
    };
    const execution: CodexExecution = {
      executionId,
      request,
      process,
      state,
      status: "running",
      cancelRequested: false,
      sessionDeleted: false,
    };
    this.executions.set(executionId, execution);
    const result = this.run(execution, command);
    return this.session(execution, result);
  }

  public async resume(request: AgentResumeRequest): Promise<AgentSession> {
    if (request.startRequest.sessionPolicy === "ephemeral") {
      throw new AgentRuntimeValidationError(
        "Ephemeral sessions cannot be resumed.",
      );
    }
    const execution = this.executions.get(request.executionId);
    if (execution !== undefined && execution.status !== "interrupted") {
      throw new AgentRuntimeValidationError(
        `Execution ${request.executionId} is not resumable.`,
      );
    }
    if (request.sessionId.trim().length === 0) {
      throw new AgentRuntimeValidationError(
        `Execution ${request.executionId} has no precise session ID.`,
      );
    }
    if (
      execution !== undefined &&
      execution.state.sessionId !== request.sessionId
    ) {
      throw new AgentRuntimeValidationError(
        `Execution ${request.executionId} session does not match the stored session.`,
      );
    }
    validateRequest(request.startRequest);
    const argsOptions: CodexExecArgsOptions =
      this.outputSchemaPath === undefined
        ? {}
        : { outputSchemaPath: this.outputSchemaPath };
    const built = buildCodexExecResumeArgs(
      request.startRequest,
      request.sessionId,
      argsOptions,
    );
    const command: CodexExecCommand = {
      ...built,
      executable: this.executable,
    };
    const process = await this.processFactory(command);
    const state: ExecutionState = {
      executionId: request.executionId,
      events: new AsyncEventQueue<AgentEvent>(),
      sequence: execution?.state.sequence ?? 0,
      sessionId: request.sessionId,
    };
    const resumedExecution: CodexExecution = execution ?? {
      executionId: request.executionId,
      request: request.startRequest,
      process,
      state,
      status: "running",
      cancelRequested: false,
      sessionDeleted: false,
    };
    resumedExecution.process = process;
    resumedExecution.state = state;
    resumedExecution.status = "running";
    resumedExecution.cancelRequested = false;
    this.executions.set(request.executionId, resumedExecution);
    this.reserveExecutionId(request.executionId);
    const result = this.run(resumedExecution, command);
    return this.session(resumedExecution, result);
  }

  public async cancel(
    request: AgentControlRequest,
  ): Promise<AgentControlResult> {
    const execution = this.executions.get(request.executionId);
    if (execution === undefined) {
      return {
        ok: false,
        code: "not_found",
        executionId: request.executionId,
        message: "Execution does not exist.",
      };
    }
    if (execution.status !== "running") {
      return {
        ok: false,
        code: "not_running",
        executionId: request.executionId,
        message: "Execution is not running.",
      };
    }
    execution.cancelRequested = true;
    if (!execution.process.kill("SIGTERM")) {
      return {
        ok: false,
        code: "not_running",
        executionId: request.executionId,
        message: "Codex process could not be terminated.",
      };
    }
    return {
      ok: true,
      executionId: request.executionId,
      status: "interrupted",
    };
  }

  public async shutdown(): Promise<void> {
    for (const execution of this.executions.values()) {
      if (execution.status !== "running") continue;
      execution.cancelRequested = true;
      execution.process.kill("SIGTERM");
    }
  }

  public async cleanup(
    request: AgentControlRequest,
  ): Promise<AgentCleanupResult> {
    const execution = this.executions.get(request.executionId);
    if (execution === undefined) {
      return {
        ok: false,
        code: "not_found",
        executionId: request.executionId,
        message: "Execution does not exist.",
      };
    }
    if (execution.status === "running") {
      return {
        ok: false,
        code: "not_terminal",
        executionId: request.executionId,
        message: "Running executions must be cancelled before cleanup.",
      };
    }

    if (
      !execution.sessionDeleted &&
      execution.request.sessionPolicy !== "ephemeral" &&
      execution.state.sessionId !== null
    ) {
      try {
        const command: CodexExecCommand = {
          ...buildCodexDeleteArgs(
            execution.state.sessionId,
            execution.request.workingDirectory,
          ),
          executable: this.executable,
        };
        const process = await this.processFactory(command);
        const stderr: string[] = [];
        const stdoutTask = (async (): Promise<void> => {
          for await (const chunk of process.stdout) {
            // The delete command has no structured output contract.
            void chunk;
          }
        })();
        const stderrTask = (async (): Promise<void> => {
          for await (const chunk of process.stderr) {
            stderr.push(Buffer.from(chunk as Uint8Array).toString("utf8"));
          }
        })();
        const exit = await process.exit;
        await Promise.all([stdoutTask, stderrTask]);
        if (exit.error !== null || exit.signal !== null || exit.code !== 0) {
          throw new Error(
            [
              `codex delete exited with code ${String(exit.code)}.`,
              exit.signal === null ? null : `signal=${exit.signal}`,
              exit.error,
              stderr.join(""),
            ]
              .filter((item): item is string => item !== null)
              .join(" ")
              .trim(),
          );
        }
        execution.sessionDeleted = true;
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
      execution.sessionDeleted = true;
    }

    let estimatedFreedBytes = 0;
    if (execution.request.runtimeDirectory !== undefined) {
      const validationError = this.runtimeDirectoryCleaner.validate(
        execution.request.runtimeDirectory,
      );
      if (validationError !== null) {
        return {
          ok: false,
          code: "cleanup_failed",
          executionId: request.executionId,
          message: validationError,
          retryable: false,
          estimatedFreedBytes: 0,
        };
      }
      const cleaned = await this.runtimeDirectoryCleaner.cleanup(
        execution.request.runtimeDirectory,
      );
      if (!cleaned.ok) {
        return {
          ok: false,
          code: "cleanup_failed",
          executionId: request.executionId,
          message: cleaned.message,
          retryable: true,
          estimatedFreedBytes: cleaned.estimatedFreedBytes,
        };
      }
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
          ? "Ephemeral session required no Codex session deletion."
          : "Codex session and application runtime directory were cleaned.",
    };
  }

  private session(
    execution: CodexExecution,
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
    const value = this.nextExecutionNumber;
    this.nextExecutionNumber += 1;
    if (value > 999) {
      throw new AgentRuntimeValidationError("Execution ID capacity exceeded.");
    }
    return `EXEC-${String(value).padStart(3, "0")}` as ExecutionId;
  }

  private reserveExecutionId(executionId: ExecutionId): void {
    const match = /^EXEC-(\d{3})$/.exec(executionId);
    if (match === null) return;
    const number = Number(match[1]);
    if (number >= this.nextExecutionNumber)
      this.nextExecutionNumber = number + 1;
  }

  private append(
    state: ExecutionState,
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
    state: ExecutionState,
    projection: CodexEventProjection,
  ): void {
    this.append(state, projection.type, projection.message, projection.data);
  }

  private async run(
    execution: CodexExecution,
    command: CodexExecCommand,
  ): Promise<AgentResult> {
    const { request, process, state } = execution;
    const description = commandDescription(command);
    const pid = process.pid ?? null;
    this.append(state, "started", "Codex exec process started.", {
      command: description,
      workingDirectory: request.workingDirectory,
      sandbox: command.sandbox,
      pid,
    });

    const parser = new CodexJsonlParser();
    const stderrDecoder = new StringDecoder("utf8");
    const stderrChunks: string[] = [];
    const changedFiles = new Set<string>();
    let threadId: string | null = state.sessionId;
    let finalOutput: AgentOutput | null = null;
    let recordCount = 0;
    let parseFailure: CodexJsonlParseError | null = null;
    let codexError: string | null = null;

    const stdoutTask = (async (): Promise<void> => {
      for await (const chunk of process.stdout) {
        try {
          for (const record of parser.push(chunk as Uint8Array)) {
            recordCount += 1;
            const projection = projectCodexRecord(record);
            if (projection.threadId !== null) {
              threadId = projection.threadId;
              state.sessionId = projection.threadId;
            }
            for (const path of projection.changedFiles) changedFiles.add(path);
            if (projection.output !== null) finalOutput = projection.output;
            if (projection.error !== null) codexError = projection.error;
            this.appendProjection(state, projection);
          }
        } catch (error) {
          if (error instanceof CodexJsonlParseError) parseFailure = error;
          else parseFailure = new CodexJsonlParseError(String(error), 0);
          return;
        }
      }
      if (parseFailure !== null) return;
      try {
        for (const record of parser.finish()) {
          recordCount += 1;
          const projection = projectCodexRecord(record);
          if (projection.threadId !== null) {
            threadId = projection.threadId;
            state.sessionId = projection.threadId;
          }
          for (const path of projection.changedFiles) changedFiles.add(path);
          if (projection.output !== null) finalOutput = projection.output;
          if (projection.error !== null) codexError = projection.error;
          this.appendProjection(state, projection);
        }
      } catch (error) {
        if (error instanceof CodexJsonlParseError) parseFailure = error;
        else parseFailure = new CodexJsonlParseError(String(error), 0);
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
    if (parseFailure === null && recordCount === 0) {
      parseFailure = new CodexJsonlParseError("no JSONL events received", 0);
    }
    const stderr = stderrChunks.join("");
    if (stderr.length > 0) {
      this.append(state, "error_output", "Codex process wrote to stderr.", {
        stderr,
      });
    }

    const metadata: AgentOutput = {
      threadId,
      pid,
      command: description,
      workingDirectory: request.workingDirectory,
      sandbox: command.sandbox,
      fileChanges: JSON.stringify([...changedFiles]),
      ...(stderr.length > 0 ? { stderr } : {}),
    };
    const diagnostics = [
      `command=${description}`,
      `workingDirectory=${request.workingDirectory}`,
      ...(stderr.length > 0 ? [`stderr=${stderr}`] : []),
    ];

    let status: AgentResult["status"] = "completed";
    let error: AgentFailure | null = null;
    let message = "Codex exec completed.";
    if (execution.cancelRequested || exit.signal !== null) {
      status = "interrupted";
      message = execution.cancelRequested
        ? "Codex exec was cancelled."
        : `Codex exec terminated by ${exit.signal}.`;
      error = failure("interrupted", message);
      diagnostics.push(message);
    } else if (parseFailure !== null) {
      status = "invalid_output";
      message = parseFailure.message;
      error = failure("malformed_output", message);
      diagnostics.push(message);
    } else if (exit.error !== null) {
      status = "failed";
      message = exit.error;
      error = failure("execution_failed", message);
      diagnostics.push(`processError=${exit.error}`);
    } else if (exit.code !== 0) {
      status = "failed";
      message = `Codex exec exited with code ${String(exit.code)}.`;
      error = failure(
        stderr.length > 0 ? "error_output" : "execution_failed",
        message,
      );
      diagnostics.push(message);
    } else if (codexError !== null) {
      status = "failed";
      message = codexError;
      error = failure("error_output", message);
      diagnostics.push(message);
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
