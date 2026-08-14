export type {
  AgentCleanupResult,
  AgentControlRequest,
  AgentControlResult,
  AgentEvent,
  AgentEventData,
  AgentEventType,
  AgentFailure,
  AgentOutput,
  AgentResult,
  AgentResultStatus,
  AgentResumeRequest,
  AgentRuntime,
  AgentSession,
  AgentStartRequest,
} from "@personal-ai-operator/contracts";

export class AgentRuntimeValidationError extends Error {
  public readonly code = "invalid_request" as const;

  public constructor(message: string) {
    super(message);
    this.name = "AgentRuntimeValidationError";
  }
}
