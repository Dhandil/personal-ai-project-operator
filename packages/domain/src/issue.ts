import type {
  DecisionId,
  FormalId,
  RecordStatus,
  TaskId,
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

export const issueSeverities = ["low", "medium", "high", "blocker"] as const;
export const issueImpacts = [
  "unknown",
  "task",
  "execution_chain",
  "goal",
] as const;

export type IssueSeverity = (typeof issueSeverities)[number];
export type IssueImpact = (typeof issueImpacts)[number];
export type IssueStatus = Extract<
  RecordStatus,
  "draft" | "in_progress" | "completed" | "cancelled"
>;

export type Issue = Readonly<
  GovernanceRecordBase & {
    readonly status: IssueStatus;
    readonly title: string;
    readonly description: string;
    readonly severity: IssueSeverity;
    readonly impact: IssueImpact;
    readonly affectedTaskIds: readonly TaskId[];
    readonly affectedObjectIds: readonly FormalId[];
    readonly discussion: readonly string[];
    readonly decisionIds: readonly DecisionId[];
    readonly recoveryPlan: string | null;
    readonly resolution: string | null;
  }
>;

export type IssueInput = Readonly<
  GovernanceRecordInput & {
    readonly title: string;
    readonly description: string;
    readonly severity: IssueSeverity;
    readonly impact: IssueImpact;
    readonly affectedTaskIds: readonly TaskId[];
    readonly affectedObjectIds: readonly FormalId[];
    readonly discussion: readonly string[];
    readonly recoveryPlan: string | null;
  }
>;

function hasImpactTargets(input: IssueInput): boolean {
  return (
    (input.impact !== "task" && input.impact !== "execution_chain") ||
    input.affectedTaskIds.length > 0
  );
}

export function createIssue(input: IssueInput): DomainResult<Issue> {
  if (
    !hasRecordIdentity(input) ||
    !hasText(input.title) ||
    !hasText(input.description) ||
    !hasImpactTargets(input) ||
    input.discussion.some((entry) => !hasText(entry)) ||
    (input.recoveryPlan !== null && !hasText(input.recoveryPlan))
  ) {
    return recordFailure(
      "invalid_issue",
      "Issue identity, description, and impact are required.",
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
        ...input.affectedObjectIds,
        ...input.affectedTaskIds,
      ]),
      title: input.title.trim(),
      description: input.description.trim(),
      severity: input.severity,
      impact: input.impact,
      affectedTaskIds: [...input.affectedTaskIds],
      affectedObjectIds: [...input.affectedObjectIds],
      discussion: input.discussion.map((entry) => entry.trim()),
      decisionIds: [],
      recoveryPlan: input.recoveryPlan?.trim() ?? null,
      resolution: null,
    },
  };
}

export function recordIssueDiscussion(
  issue: Issue,
  entry: string,
): DomainResult<Issue> {
  if (!hasText(entry)) {
    return recordFailure(
      "invalid_issue",
      "Issue discussion entries cannot be empty.",
    );
  }

  return {
    ok: true,
    value: {
      ...issue,
      status: issue.status === "draft" ? "in_progress" : issue.status,
      discussion: [...issue.discussion, entry.trim()],
    },
  };
}

export function linkDecisionToIssue(
  issue: Issue,
  decisionId: DecisionId,
): DomainResult<Issue> {
  if (issue.decisionIds.includes(decisionId)) {
    return { ok: true, value: issue };
  }
  return {
    ok: true,
    value: { ...issue, decisionIds: [...issue.decisionIds, decisionId] },
  };
}

export function resolveIssue(
  issue: Issue,
  resolution: string,
): DomainResult<Issue> {
  if (!hasText(resolution)) {
    return recordFailure("invalid_issue", "Issue resolution cannot be empty.");
  }
  if (issue.status === "completed" || issue.status === "cancelled") {
    return recordFailure(
      "invalid_issue",
      "A closed issue cannot be resolved again.",
    );
  }

  return {
    ok: true,
    value: { ...issue, status: "completed", resolution: resolution.trim() },
  };
}

export function hasAffectedTask(issue: Issue, taskId: TaskId): boolean {
  return issue.affectedTaskIds.includes(taskId);
}
