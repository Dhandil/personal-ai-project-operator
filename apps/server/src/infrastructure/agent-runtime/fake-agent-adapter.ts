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
import { isFormalId } from "@personal-ai-operator/contracts";

import { AgentRuntimeValidationError } from "./agent-runtime-port.js";

export const fakeAgentOutcomes = [
  "success",
  "failure",
  "interrupted",
  "privilege_violation",
  "review_failed",
  "malformed_output",
  "error_output",
] as const;

export type FakeAgentOutcome = (typeof fakeAgentOutcomes)[number];

export type FakeAgentScenario = Readonly<{
  readonly outcome: FakeAgentOutcome;
  readonly cleanup?: "success" | "failure";
  readonly output?: AgentOutput;
  readonly message?: string;
  readonly resumeOutcome?: FakeAgentOutcome;
}>;

export type FakeAgentAdapterOptions = Readonly<{
  readonly now?: () => UtcIsoTimestamp;
  readonly scenarios?: readonly FakeAgentScenario[];
  readonly defaultScenario?: FakeAgentScenario;
}>;

type FakeRunStatus = "running" | AgentResult["status"];

type Deferred<Value> = Readonly<{
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
}>;

type FakeExecution = {
  readonly executionId: ExecutionId;
  readonly sessionId: string;
  readonly scenario: FakeAgentScenario;
  readonly events: AgentEvent[];
  status: FakeRunStatus;
  cleaned: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  result: Deferred<AgentResult>;
  eventStart: number;
  eventEnd: number | null;
};

function timestamp(): UtcIsoTimestamp {
  return new Date().toISOString() as UtcIsoTimestamp;
}

function deferred<Value>(): Deferred<Value> {
  let resolvePromise: ((value: Value) => void) | undefined;
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => resolvePromise?.(value),
  };
}

function failure(code: AgentFailure["code"], message: string): AgentFailure {
  return { code, message };
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

function isNonEmptyString(value: unknown): value is string {
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
  if (
    !isNonEmptyString(request.role) ||
    !isNonEmptyString(request.prompt) ||
    !isNonEmptyString(request.workingDirectory)
  ) {
    throw new AgentRuntimeValidationError(
      "role, prompt, and workingDirectory are required.",
    );
  }
  if (
    !Array.isArray(request.allowedPaths) ||
    !Array.isArray(request.forbiddenPaths) ||
    !request.allowedPaths.every(isNonEmptyString) ||
    !request.forbiddenPaths.every(isNonEmptyString)
  ) {
    throw new AgentRuntimeValidationError(
      "allowedPaths and forbiddenPaths must contain path strings.",
    );
  }
  if (
    !Array.isArray(request.context) ||
    !request.context.every(
      (item) => isNonEmptyString(item.key) && isNonEmptyString(item.value),
    )
  ) {
    throw new AgentRuntimeValidationError(
      "context must contain non-empty key/value items.",
    );
  }
}

function defaultScenario(): FakeAgentScenario {
  return { outcome: "success", cleanup: "success" };
}

export class FakeAgentAdapter implements AgentRuntime {
  private readonly now: () => UtcIsoTimestamp;
  private readonly scenarios: FakeAgentScenario[];
  private readonly configuredDefault: FakeAgentScenario;
  private readonly executions = new Map<ExecutionId, FakeExecution>();
  private nextExecutionNumber = 1;

  public constructor(options: FakeAgentAdapterOptions = {}) {
    this.now = options.now ?? timestamp;
    this.scenarios = [...(options.scenarios ?? [])];
    this.configuredDefault = options.defaultScenario ?? defaultScenario();
  }

  public async start(
    request: AgentStartRequest,
    scenario?: FakeAgentScenario,
  ): Promise<AgentSession> {
    validateRequest(request);
    const selected =
      scenario ?? this.scenarios.shift() ?? this.configuredDefault;
    const executionId = this.nextExecutionId();
    const state: FakeExecution = {
      executionId,
      sessionId: `fake-session-${executionId}`,
      scenario: selected,
      events: [],
      status: "running",
      cleaned: false,
      timer: null,
      result: deferred<AgentResult>(),
      eventStart: 0,
      eventEnd: null,
    };
    this.executions.set(executionId, state);
    this.schedule(state, selected.outcome);
    return this.session(state);
  }

  public async resume(request: AgentResumeRequest): Promise<AgentSession> {
    validateRequest(request.startRequest);
    const state = this.executions.get(request.executionId);
    if (state === undefined) {
      throw new AgentRuntimeValidationError(
        `Execution ${request.executionId} does not exist.`,
      );
    }
    if (state.cleaned || state.status !== "interrupted") {
      throw new AgentRuntimeValidationError(
        `Execution ${request.executionId} is not resumable.`,
      );
    }
    if (request.sessionId !== state.sessionId) {
      throw new AgentRuntimeValidationError(
        `Execution ${request.executionId} session does not match the stored session.`,
      );
    }
    state.status = "running";
    state.result = deferred<AgentResult>();
    state.eventStart = state.events.length;
    state.eventEnd = null;
    this.schedule(state, state.scenario.resumeOutcome ?? "success");
    return this.session(state);
  }

  public async cancel(
    request: AgentControlRequest,
  ): Promise<AgentControlResult> {
    const state = this.executions.get(request.executionId);
    if (state === undefined) {
      return {
        ok: false,
        code: "not_found",
        executionId: request.executionId,
        message: "Execution does not exist.",
      };
    }
    if (state.status !== "running") {
      return {
        ok: false,
        code: "not_running",
        executionId: request.executionId,
        message: "Execution is not running.",
      };
    }
    if (state.timer !== null) clearTimeout(state.timer);
    state.timer = null;
    this.appendEvent(state, "interrupted", "Execution was cancelled.", {});
    this.finalize(
      state,
      "interrupted",
      "Execution was cancelled.",
      failure("interrupted", "Execution was cancelled."),
      null,
      ["cancelled"],
    );
    return {
      ok: true,
      executionId: state.executionId,
      status: "interrupted",
    };
  }

  public async cleanup(
    request: AgentControlRequest,
  ): Promise<AgentCleanupResult> {
    const state = this.executions.get(request.executionId);
    if (state === undefined) {
      return {
        ok: false,
        code: "not_found",
        executionId: request.executionId,
        message: "Execution does not exist.",
      };
    }
    if (state.status === "running") {
      return {
        ok: false,
        code: "not_terminal",
        executionId: request.executionId,
        message: "Running executions must be cancelled before cleanup.",
      };
    }
    if (state.scenario.cleanup === "failure") {
      return {
        ok: false,
        code: "cleanup_failed",
        executionId: request.executionId,
        message: "The simulated cleanup operation failed.",
      };
    }
    state.cleaned = true;
    return {
      ok: true,
      executionId: state.executionId,
      status: "cleaned",
    };
  }

  private nextExecutionId(): ExecutionId {
    const number = this.nextExecutionNumber;
    this.nextExecutionNumber += 1;
    if (number > 999) {
      throw new AgentRuntimeValidationError("Execution ID capacity exceeded.");
    }
    return `EXEC-${String(number).padStart(3, "0")}` as ExecutionId;
  }

  private session(state: FakeExecution): AgentSession {
    const result = state.result.promise;
    const start = state.eventStart;
    const events = (async function* (): AsyncGenerator<AgentEvent> {
      await result;
      const end = state.eventEnd ?? state.events.length;
      yield* state.events.slice(start, end);
    })();
    return {
      executionId: state.executionId,
      sessionId: state.sessionId,
      events,
      result,
    };
  }

  private schedule(state: FakeExecution, outcome: FakeAgentOutcome): void {
    this.appendEvent(state, "started", "Execution started.", {});
    state.timer = setTimeout(() => {
      state.timer = null;
      this.finishOutcome(state, outcome);
    }, 0);
  }

  private finishOutcome(state: FakeExecution, outcome: FakeAgentOutcome): void {
    const message =
      state.scenario.message ?? "Simulated Agent runtime outcome.";
    switch (outcome) {
      case "success":
        this.appendEvent(state, "progress", "Execution produced a result.", {});
        this.appendEvent(state, "completed", "Execution completed.", {});
        this.finalize(
          state,
          "completed",
          "Execution completed.",
          null,
          state.scenario.output ?? { summary: "success" },
          [],
        );
        return;
      case "failure":
        this.appendEvent(state, "failed", message, {});
        this.finalize(
          state,
          "failed",
          message,
          failure("execution_failed", message),
          null,
          [message],
        );
        return;
      case "interrupted":
        this.appendEvent(state, "interrupted", message, {});
        this.finalize(
          state,
          "interrupted",
          message,
          failure("interrupted", message),
          null,
          [message],
        );
        return;
      case "privilege_violation":
        this.appendEvent(state, "privilege_violation", message, {});
        this.finalize(
          state,
          "privilege_violation",
          message,
          failure("privilege_violation", message),
          null,
          [message],
        );
        return;
      case "review_failed":
        this.appendEvent(state, "review_failed", message, {});
        this.finalize(
          state,
          "review_failed",
          message,
          failure("review_failed", message),
          null,
          [message],
        );
        return;
      case "malformed_output":
        this.appendEvent(
          state,
          "output",
          "Output did not satisfy the result contract.",
          {},
        );
        this.finalize(
          state,
          "invalid_output",
          message,
          failure("malformed_output", message),
          null,
          [message],
        );
        return;
      case "error_output":
        this.appendEvent(state, "error_output", message, {});
        this.finalize(
          state,
          "failed",
          message,
          failure("error_output", message),
          null,
          [message],
        );
        return;
    }
  }

  private appendEvent(
    state: FakeExecution,
    type: AgentEvent["type"],
    message: string,
    data: AgentEvent["data"],
  ): void {
    state.events.push({
      executionId: state.executionId,
      sequence: state.events.length + 1,
      occurredAt: this.now(),
      type,
      message,
      data,
    });
  }

  private finalize(
    state: FakeExecution,
    status: AgentResult["status"],
    _message: string,
    error: AgentFailure | null,
    output: AgentOutput | null,
    diagnostics: readonly string[],
  ): void {
    if (state.status !== "running") return;
    state.status = status;
    state.eventEnd = state.events.length;
    state.result.resolve({
      executionId: state.executionId,
      status,
      output,
      error,
      diagnostics,
    });
  }
}
