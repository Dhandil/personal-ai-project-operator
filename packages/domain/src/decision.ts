import type {
  DecisionId,
  FormalId,
  RecordStatus,
  UtcIsoTimestamp,
} from "@personal-ai-operator/contracts";

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

export type DecisionStatus = Extract<
  RecordStatus,
  "draft" | "completed" | "cancelled"
>;

export type UserDecision = Readonly<{
  readonly decidedBy: "user";
  readonly selectedOption: string;
  readonly rationale: string;
  readonly decidedAt: UtcIsoTimestamp;
}>;

export type Decision = Readonly<
  GovernanceRecordBase & {
    readonly id: DecisionId;
    readonly status: DecisionStatus;
    readonly question: string;
    readonly options: readonly string[];
    readonly proposedBy: "agent" | "user";
    readonly sourceIssueId: FormalId | null;
    readonly decision: UserDecision | null;
  }
>;

export type DecisionInput = Readonly<
  GovernanceRecordInput & {
    readonly id: DecisionId;
    readonly question: string;
    readonly options: readonly string[];
    readonly proposedBy: "agent" | "user";
    readonly sourceIssueId: FormalId | null;
  }
>;

export function createDecision(input: DecisionInput): DomainResult<Decision> {
  if (
    !hasRecordIdentity(input) ||
    !hasText(input.question) ||
    !hasRequiredTextList(input.options) ||
    new Set(input.options).size !== input.options.length
  ) {
    return recordFailure(
      "invalid_decision",
      "Decision question and unique options are required.",
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
      relatedObjectIds: uniqueIds([
        ...input.relatedObjectIds,
        ...(input.sourceIssueId === null ? [] : [input.sourceIssueId]),
      ]),
      question: input.question.trim(),
      options: input.options.map((option) => option.trim()),
      proposedBy: input.proposedBy,
      sourceIssueId: input.sourceIssueId,
      decision: null,
    },
  };
}

export function decideDecision(
  decision: Decision,
  userDecision: UserDecision,
): DomainResult<Decision> {
  if (decision.status !== "draft") {
    return recordFailure(
      "invalid_decision",
      "Only a proposed decision can be decided.",
    );
  }
  if (!decision.options.includes(userDecision.selectedOption)) {
    return recordFailure(
      "invalid_decision",
      "Selected option must be one of the proposed options.",
    );
  }
  if (!hasText(userDecision.rationale)) {
    return recordFailure(
      "decision_required",
      "A decision requires a rationale.",
    );
  }

  return {
    ok: true,
    value: {
      ...decision,
      status: "completed",
      decision: { ...userDecision, rationale: userDecision.rationale.trim() },
    },
  };
}
