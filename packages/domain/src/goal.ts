import type { GoalId, UtcIsoTimestamp } from "@personal-ai-operator/contracts";

import type { DomainError, DomainResult } from "./workflow.js";

export type GoalStatus =
  "draft" | "ready" | "in_progress" | "completed" | "paused" | "cancelled";

export type GoalApproval = Readonly<{
  readonly decidedBy: "user";
  readonly approved: boolean;
  readonly decidedAt: UtcIsoTimestamp;
}>;

export type Goal = Readonly<{
  readonly id: GoalId;
  readonly title: string;
  readonly boundary: readonly string[];
  readonly risks: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly proposedBy: "project-lead-agent";
  readonly status: GoalStatus;
  readonly approval: GoalApproval | null;
}>;

export type GoalInput = Readonly<{
  readonly id: GoalId;
  readonly title: string;
  readonly boundary: readonly string[];
  readonly risks: readonly string[];
  readonly acceptanceCriteria: readonly string[];
}>;

export type GoalDecision = Readonly<{
  readonly approved: boolean;
  readonly decidedAt: UtcIsoTimestamp;
}>;

function goalError(
  code: "invalid_goal" | "goal_not_approved",
  message: string,
): DomainResult<never> {
  const error: DomainError = { code, message };
  return { ok: false, error };
}

function hasContent(values: readonly string[]): boolean {
  return values.length > 0 && values.every((value) => value.trim().length > 0);
}

export function createGoalProposal(input: GoalInput): DomainResult<Goal> {
  if (
    input.title.trim().length === 0 ||
    !hasContent(input.boundary) ||
    !hasContent(input.acceptanceCriteria) ||
    input.risks.some((risk) => risk.trim().length === 0)
  ) {
    return goalError(
      "invalid_goal",
      "Goal title, boundary, and acceptance criteria are required.",
    );
  }

  return {
    ok: true,
    value: {
      id: input.id,
      title: input.title.trim(),
      boundary: input.boundary.map((item) => item.trim()),
      risks: input.risks.map((item) => item.trim()),
      acceptanceCriteria: input.acceptanceCriteria.map((item) => item.trim()),
      proposedBy: "project-lead-agent",
      status: "draft",
      approval: null,
    },
  };
}

export function decideGoal(
  goal: Goal,
  decision: GoalDecision,
): DomainResult<Goal> {
  if (goal.status !== "draft") {
    return goalError(
      "invalid_goal",
      "Only a draft goal can receive a user decision.",
    );
  }

  return {
    ok: true,
    value: {
      ...goal,
      status: decision.approved ? "ready" : "cancelled",
      approval: {
        decidedBy: "user",
        approved: decision.approved,
        decidedAt: decision.decidedAt,
      },
    },
  };
}

export function startGoal(goal: Goal): DomainResult<Goal> {
  if (goal.status !== "ready" || goal.approval?.approved !== true) {
    return goalError(
      "goal_not_approved",
      "Only a user-approved goal can start execution.",
    );
  }

  return { ok: true, value: { ...goal, status: "in_progress" } };
}

export function isApprovedGoal(goal: Goal): boolean {
  return (
    goal.approval?.approved === true &&
    (goal.status === "ready" || goal.status === "in_progress")
  );
}
