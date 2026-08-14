import type {
  ExecutionId,
  FormalId,
  RecordStatus,
  UtcIsoTimestamp,
} from "@personal-ai-operator/contracts";
import {
  isFormalId,
  isRecordStatus,
  isUtcIsoTimestamp,
} from "@personal-ai-operator/contracts";

export const auditEventTypes = [
  "failure",
  "privilege_violation",
  "recovery",
  "status_changed",
] as const;

export type AuditEventType = (typeof auditEventTypes)[number];
export type AuditEventActor = "system" | "agent" | "user" | "reviewer";
export type AuditDetailValue = string | number | boolean | null;
export type AuditDetails = Readonly<Record<string, AuditDetailValue>>;

export type AuditStatusChange = Readonly<{
  readonly from: RecordStatus | null;
  readonly to: RecordStatus;
  readonly reason: string;
}>;

export type AuditEvent = Readonly<{
  readonly schemaVersion: 1;
  readonly id: ExecutionId;
  readonly occurredAt: UtcIsoTimestamp;
  readonly type: AuditEventType;
  readonly actor: AuditEventActor;
  readonly action: string;
  readonly relatedObjectIds: readonly FormalId[];
  readonly executionId: ExecutionId | null;
  readonly statusChange: AuditStatusChange | null;
  readonly details: AuditDetails;
}>;

export type AuditEventInput = Readonly<{
  readonly id: ExecutionId;
  readonly occurredAt: UtcIsoTimestamp;
  readonly type: AuditEventType;
  readonly actor: AuditEventActor;
  readonly action: string;
  readonly relatedObjectIds?: readonly FormalId[];
  readonly executionId?: ExecutionId | null;
  readonly statusChange?: AuditStatusChange | null;
  readonly details?: AuditDetails;
}>;

export type AuditEventValidationError = Readonly<{
  readonly code: "invalid_event";
  readonly message: string;
  readonly details: readonly string[];
}>;

export type AuditEventResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: AuditEventValidationError }>;

function failure<Value>(
  message: string,
  details: readonly string[] = [],
): AuditEventResult<Value> {
  return {
    ok: false,
    error: { code: "invalid_event", message, details },
  };
}

export function isAuditEventType(value: unknown): value is AuditEventType {
  return (
    typeof value === "string" &&
    auditEventTypes.includes(value as AuditEventType)
  );
}

export function isAuditEventActor(value: unknown): value is AuditEventActor {
  return (
    value === "system" ||
    value === "agent" ||
    value === "user" ||
    value === "reviewer"
  );
}

function isAuditDetailValue(value: unknown): value is AuditDetailValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function isAuditDetails(value: unknown): value is AuditDetails {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(isAuditDetailValue);
}

function isStatusChange(value: unknown): value is AuditStatusChange {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    (candidate.from === null || isRecordStatus(candidate.from)) &&
    isRecordStatus(candidate.to) &&
    typeof candidate.reason === "string" &&
    candidate.reason.trim().length > 0
  );
}

export function validateAuditEvent(
  value: unknown,
): AuditEventResult<AuditEvent> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return failure("Audit event must be a JSON object.");
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 1) {
    return failure("Audit event schemaVersion must be 1.");
  }
  if (
    typeof candidate.id !== "string" ||
    !isFormalId(candidate.id) ||
    !candidate.id.startsWith("EXEC-")
  ) {
    return failure("Audit event id must be a non-zero EXEC-### identifier.");
  }
  if (!isUtcIsoTimestamp(candidate.occurredAt)) {
    return failure("Audit event occurredAt must be a UTC ISO timestamp.");
  }
  if (!isAuditEventType(candidate.type)) {
    return failure("Audit event type is not supported.");
  }
  if (!isAuditEventActor(candidate.actor)) {
    return failure("Audit event actor is not supported.");
  }
  if (typeof candidate.action !== "string" || candidate.action.trim() === "") {
    return failure("Audit event action must not be empty.");
  }
  if (
    !Array.isArray(candidate.relatedObjectIds) ||
    !candidate.relatedObjectIds.every((id) => isFormalId(id))
  ) {
    return failure("Audit event relatedObjectIds must contain formal IDs.");
  }
  if (
    candidate.executionId !== null &&
    (typeof candidate.executionId !== "string" ||
      !isFormalId(candidate.executionId) ||
      !candidate.executionId.startsWith("EXEC-"))
  ) {
    return failure("Audit event executionId must be null or an EXEC-### ID.");
  }
  if (
    candidate.statusChange !== null &&
    !isStatusChange(candidate.statusChange)
  ) {
    return failure("Audit event statusChange is invalid.");
  }
  if (
    candidate.type === "status_changed" &&
    (candidate.statusChange === null || !isStatusChange(candidate.statusChange))
  ) {
    return failure("Status change events require statusChange details.");
  }
  if (candidate.type !== "status_changed" && candidate.statusChange !== null) {
    return failure(
      "Only status change events may contain statusChange details.",
    );
  }
  if (!isAuditDetails(candidate.details)) {
    return failure("Audit event details must contain JSON scalar values.");
  }

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      id: candidate.id as ExecutionId,
      occurredAt: candidate.occurredAt as UtcIsoTimestamp,
      type: candidate.type,
      actor: candidate.actor,
      action: candidate.action,
      relatedObjectIds: [...candidate.relatedObjectIds] as FormalId[],
      executionId: candidate.executionId as ExecutionId | null,
      statusChange: candidate.statusChange as AuditStatusChange | null,
      details: { ...candidate.details },
    },
  };
}

export function createAuditEvent(
  input: AuditEventInput,
): AuditEventResult<AuditEvent> {
  const event: AuditEvent = {
    schemaVersion: 1,
    id: input.id,
    occurredAt: input.occurredAt,
    type: input.type,
    actor: input.actor,
    action: input.action,
    relatedObjectIds: [...(input.relatedObjectIds ?? [])],
    executionId: input.executionId ?? null,
    statusChange: input.statusChange ?? null,
    details: { ...(input.details ?? {}) },
  };
  return validateAuditEvent(event);
}
