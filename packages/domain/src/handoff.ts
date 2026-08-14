import type {
  ExecutionId,
  FormalId,
  GoalId,
  HandoffId,
  ReportId,
  RecordStatus,
  TaskId,
} from "@personal-ai-operator/contracts";

import { type RoleKey } from "./role.js";
import {
  hasRecordIdentity,
  hasRequiredTextList,
  hasText,
  recordFailure,
  type GovernanceRecordBase,
  type GovernanceRecordInput,
  uniqueIds,
} from "./record.js";
import type { DomainResult } from "./workflow.js";

export type HandoffReference = Readonly<{
  readonly reference: string;
  readonly description: string;
}>;

export type HandoffStatus = Extract<
  RecordStatus,
  "draft" | "ready" | "completed"
>;

export type Handoff = Readonly<
  GovernanceRecordBase & {
    readonly id: HandoffId;
    readonly status: HandoffStatus;
    readonly goalId: GoalId;
    readonly taskId: TaskId;
    readonly fromRole: RoleKey;
    readonly toRole: RoleKey;
    readonly summary: string;
    readonly outputs: readonly HandoffReference[];
    readonly verificationEvidence: readonly HandoffReference[];
    readonly openIssueIds: readonly FormalId[];
    readonly reportIds: readonly ReportId[];
    readonly executionIds: readonly ExecutionId[];
  }
>;

export type HandoffInput = Readonly<
  GovernanceRecordInput & {
    readonly id: HandoffId;
    readonly goalId: GoalId;
    readonly taskId: TaskId;
    readonly fromRole: RoleKey;
    readonly toRole: RoleKey;
    readonly summary: string;
    readonly outputs: readonly HandoffReference[];
    readonly verificationEvidence: readonly HandoffReference[];
    readonly openIssueIds: readonly FormalId[];
    readonly reportIds: readonly ReportId[];
    readonly executionIds: readonly ExecutionId[];
  }
>;

function validReferences(references: readonly HandoffReference[]): boolean {
  return (
    references.length > 0 &&
    references.every(
      (reference) =>
        hasText(reference.reference) && hasText(reference.description),
    )
  );
}

export function createHandoff(input: HandoffInput): DomainResult<Handoff> {
  if (
    !hasRecordIdentity(input) ||
    !hasText(input.summary) ||
    !validReferences(input.outputs) ||
    !validReferences(input.verificationEvidence)
  ) {
    return recordFailure(
      "invalid_handoff",
      "A handoff requires a summary, actual outputs, and verification evidence.",
    );
  }

  return {
    ok: true,
    value: {
      id: input.id,
      revision: input.revision,
      status: "ready",
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      relatedObjectIds: uniqueIds([
        ...input.relatedObjectIds,
        input.goalId,
        input.taskId,
        ...input.openIssueIds,
        ...input.reportIds,
        ...input.executionIds,
      ]),
      goalId: input.goalId,
      taskId: input.taskId,
      fromRole: input.fromRole,
      toRole: input.toRole,
      summary: input.summary.trim(),
      outputs: input.outputs.map((reference) => ({
        reference: reference.reference.trim(),
        description: reference.description.trim(),
      })),
      verificationEvidence: input.verificationEvidence.map((reference) => ({
        reference: reference.reference.trim(),
        description: reference.description.trim(),
      })),
      openIssueIds: [...input.openIssueIds],
      reportIds: [...input.reportIds],
      executionIds: [...input.executionIds],
    },
  };
}

export function completeHandoff(handoff: Handoff): DomainResult<Handoff> {
  if (handoff.status !== "ready") {
    return recordFailure(
      "invalid_handoff",
      "Only a ready handoff can be completed.",
    );
  }
  if (
    !hasRequiredTextList(handoff.outputs.map((output) => output.reference)) ||
    !hasRequiredTextList(
      handoff.verificationEvidence.map((evidence) => evidence.reference),
    )
  ) {
    return recordFailure(
      "invalid_handoff",
      "Handoff outputs and evidence cannot be empty.",
    );
  }

  return { ok: true, value: { ...handoff, status: "completed" } };
}
