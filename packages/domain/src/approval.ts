import type {
  FormalId,
  RecordStatus,
  UtcIsoTimestamp,
} from "@personal-ai-operator/contracts";

import {
  hasRecordIdentity,
  hasText,
  recordFailure,
  type GovernanceRecordBase,
  type GovernanceRecordInput,
  uniqueIds,
} from "./record.js";
import type { DomainResult } from "./workflow.js";

export const approvalTypes = [
  "project_definition",
  "product_scope",
  "technical_design",
  "short_term_goal_start",
  "short_term_goal_acceptance_and_main_merge",
] as const;

export type ApprovalType = (typeof approvalTypes)[number];
export type ApprovalOutcome = "approved" | "modified" | "rejected";
export type ApprovalStatus = Extract<
  RecordStatus,
  "draft" | "completed" | "cancelled"
>;

export type ApprovalDecision = Readonly<{
  readonly decidedBy: "user";
  readonly outcome: ApprovalOutcome;
  readonly decidedAt: UtcIsoTimestamp;
  readonly note: string;
}>;

export type Approval = Readonly<
  GovernanceRecordBase & {
    readonly status: ApprovalStatus;
    readonly approvalType: ApprovalType;
    readonly subjectId: FormalId;
    readonly requestedBy: "agent" | "system";
    readonly request: string;
    readonly decision: ApprovalDecision | null;
  }
>;

export type ApprovalInput = Readonly<
  GovernanceRecordInput & {
    readonly approvalType: ApprovalType;
    readonly subjectId: FormalId;
    readonly requestedBy: "agent" | "system";
    readonly request: string;
  }
>;

export function createApproval(input: ApprovalInput): DomainResult<Approval> {
  if (!hasRecordIdentity(input) || !hasText(input.request)) {
    return recordFailure(
      "invalid_approval",
      "Approval identity and request are required.",
    );
  }

  return {
    ok: true,
    value: {
      id: input.id,
      revision: input.revision,
      status: "draft",
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      relatedObjectIds: uniqueIds([input.subjectId, ...input.relatedObjectIds]),
      approvalType: input.approvalType,
      subjectId: input.subjectId,
      requestedBy: input.requestedBy,
      request: input.request.trim(),
      decision: null,
    },
  };
}

export function decideApproval(
  approval: Approval,
  decision: ApprovalDecision,
): DomainResult<Approval> {
  if (approval.status !== "draft") {
    return recordFailure(
      "invalid_approval",
      "Only a pending approval can be decided.",
    );
  }
  if (!hasText(decision.note)) {
    return recordFailure(
      "decision_required",
      "An approval decision requires a note.",
    );
  }

  return {
    ok: true,
    value: {
      ...approval,
      status: decision.outcome === "rejected" ? "cancelled" : "completed",
      decision: { ...decision, note: decision.note.trim() },
    },
  };
}

export function isApprovalAccepted(approval: Approval): boolean {
  return (
    approval.status === "completed" && approval.decision?.outcome === "approved"
  );
}
