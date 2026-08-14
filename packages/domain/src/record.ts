import type {
  FormalId,
  RecordStatus,
  UtcIsoTimestamp,
} from "@personal-ai-operator/contracts";

import type { DomainError, DomainErrorCode, DomainResult } from "./workflow.js";

export type GovernanceRecordBase = Readonly<{
  readonly id: FormalId;
  readonly revision: number;
  readonly status: RecordStatus;
  readonly createdAt: UtcIsoTimestamp;
  readonly updatedAt: UtcIsoTimestamp;
  readonly relatedObjectIds: readonly FormalId[];
}>;

export type GovernanceRecordInput = Readonly<{
  readonly id: FormalId;
  readonly revision: number;
  readonly createdAt: UtcIsoTimestamp;
  readonly updatedAt: UtcIsoTimestamp;
  readonly relatedObjectIds: readonly FormalId[];
}>;

export function recordFailure<Value>(
  code: DomainErrorCode,
  message: string,
): DomainResult<Value> {
  const error: DomainError = { code, message };
  return { ok: false, error };
}

export function hasRecordIdentity(input: GovernanceRecordInput): boolean {
  return Number.isInteger(input.revision) && input.revision > 0;
}

export function hasText(value: string): boolean {
  return value.trim().length > 0;
}

export function hasRequiredTextList(values: readonly string[]): boolean {
  return values.length > 0 && values.every(hasText);
}

export function uniqueIds(ids: readonly FormalId[]): readonly FormalId[] {
  return [...new Set(ids)];
}
