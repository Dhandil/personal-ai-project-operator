import type { ExecutionId, GoalId, TaskId } from "./identifiers.js";
import type { UtcIsoTimestamp } from "./times.js";

export const agentEventTypes = [
  "started",
  "progress",
  "output",
  "completed",
  "failed",
  "interrupted",
  "privilege_violation",
  "review_failed",
  "error_output",
] as const;

export type AgentEventType = (typeof agentEventTypes)[number];

export const agentResultStatuses = [
  "completed",
  "failed",
  "interrupted",
  "privilege_violation",
  "review_failed",
  "invalid_output",
] as const;

export type AgentResultStatus = (typeof agentResultStatuses)[number];

export const agentFailureCodes = [
  "execution_failed",
  "interrupted",
  "privilege_violation",
  "review_failed",
  "malformed_output",
  "error_output",
] as const;

export type AgentFailureCode = (typeof agentFailureCodes)[number];

export type AgentScalar = string | number | boolean | null;
export type AgentEventData = Readonly<Record<string, AgentScalar>>;
export type AgentOutput = Readonly<Record<string, AgentScalar>>;

export type AgentContextItem = Readonly<{
  readonly key: string;
  readonly value: string;
}>;

export type AgentStartRequest = Readonly<{
  readonly taskId: TaskId;
  readonly goalId: GoalId | null;
  readonly role: string;
  readonly prompt: string;
  readonly workingDirectory: string;
  readonly allowedPaths: readonly string[];
  readonly forbiddenPaths: readonly string[];
  readonly context: readonly AgentContextItem[];
}>;

export type AgentResumeRequest = Readonly<{
  readonly executionId: ExecutionId;
}>;

export type AgentControlRequest = Readonly<{
  readonly executionId: ExecutionId;
}>;

export type AgentEvent = Readonly<{
  readonly executionId: ExecutionId;
  readonly sequence: number;
  readonly occurredAt: UtcIsoTimestamp;
  readonly type: AgentEventType;
  readonly message: string;
  readonly data: AgentEventData;
}>;

export type AgentFailure = Readonly<{
  readonly code: AgentFailureCode;
  readonly message: string;
}>;

export type AgentResult = Readonly<{
  readonly executionId: ExecutionId;
  readonly status: AgentResultStatus;
  readonly output: AgentOutput | null;
  readonly error: AgentFailure | null;
  readonly diagnostics: readonly string[];
}>;

export type AgentSession = Readonly<{
  readonly executionId: ExecutionId;
  readonly events: AsyncIterable<AgentEvent>;
  readonly result: Promise<AgentResult>;
}>;

export type AgentControlStatus = "interrupted" | "completed";

export type AgentControlResult =
  | Readonly<{
      readonly ok: true;
      readonly executionId: ExecutionId;
      readonly status: AgentControlStatus;
    }>
  | Readonly<{
      readonly ok: false;
      readonly code: "not_found" | "not_running" | "not_resumable";
      readonly executionId: ExecutionId;
      readonly message: string;
    }>;

export type AgentCleanupResult =
  | Readonly<{
      readonly ok: true;
      readonly executionId: ExecutionId;
      readonly status: "cleaned";
    }>
  | Readonly<{
      readonly ok: false;
      readonly code: "cleanup_failed" | "not_found" | "not_terminal";
      readonly executionId: ExecutionId;
      readonly message: string;
    }>;

export type AgentRuntime = Readonly<{
  readonly start: (request: AgentStartRequest) => Promise<AgentSession>;
  readonly resume: (request: AgentResumeRequest) => Promise<AgentSession>;
  readonly cancel: (
    request: AgentControlRequest,
  ) => Promise<AgentControlResult>;
  readonly cleanup: (
    request: AgentControlRequest,
  ) => Promise<AgentCleanupResult>;
}>;

export function isAgentEventType(value: unknown): value is AgentEventType {
  return (
    typeof value === "string" &&
    agentEventTypes.includes(value as AgentEventType)
  );
}

export function isAgentResultStatus(
  value: unknown,
): value is AgentResultStatus {
  return (
    typeof value === "string" &&
    agentResultStatuses.includes(value as AgentResultStatus)
  );
}
