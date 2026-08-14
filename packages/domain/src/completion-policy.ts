import type { GoalId } from "@personal-ai-operator/contracts";

import { isApprovedGoal, type Goal } from "./goal.js";
import { requireApprovalGate } from "./approval-policy.js";
import type { Approval } from "./approval.js";
import type { Issue } from "./issue.js";
import { hasRequiredTextList, hasText, recordFailure } from "./record.js";
import { transitionTask } from "./task-transition.js";
import type { Task } from "./task.js";
import type { DomainResult } from "./workflow.js";

export type CompletionEvidence = Readonly<{
  readonly actualOutputs: readonly string[];
  readonly commandsRun: readonly string[];
  readonly verificationEvidence: readonly string[];
  readonly gitDiffReference: string;
  readonly allowedPathsVerified: boolean;
  readonly verificationPassed: boolean;
  readonly unresolvedViolations: readonly string[];
  readonly reviewerApproved: boolean;
}>;

export type CompletionInput = Readonly<{
  readonly goal: Goal;
  readonly task: Task;
  readonly approvals: readonly Approval[];
  readonly blockingIssues: readonly Issue[];
  readonly evidence: CompletionEvidence;
}>;

export type CompletionDecision =
  | Readonly<{ readonly accepted: true; readonly reasons: readonly [] }>
  | Readonly<{ readonly accepted: false; readonly reasons: readonly string[] }>;

function hasOpenIssue(issue: Issue): boolean {
  return issue.status !== "completed" && issue.status !== "cancelled";
}

function acceptanceApproval(input: CompletionInput) {
  return requireApprovalGate({
    approvalType: "short_term_goal_acceptance_and_main_merge",
    subjectId: input.goal.id as GoalId,
    approvals: input.approvals,
  });
}

export function evaluateTaskCompletion(
  input: CompletionInput,
): CompletionDecision {
  const reasons: string[] = [];
  if (input.task.status !== "in_review") {
    reasons.push("Task must be in_review before completion.");
  }
  if (input.task.goalId !== input.goal.id) {
    reasons.push("Task does not belong to the supplied goal.");
  }
  if (!isApprovedGoal(input.goal)) {
    reasons.push("The goal must be approved and in progress.");
  }
  if (!acceptanceApproval(input).ok) {
    reasons.push("Accepted user approval is required before completion.");
  }
  if (!hasRequiredTextList(input.evidence.actualOutputs)) {
    reasons.push("Actual task outputs are required.");
  }
  if (!hasRequiredTextList(input.evidence.commandsRun)) {
    reasons.push("Executed verification commands are required.");
  }
  if (!hasRequiredTextList(input.evidence.verificationEvidence)) {
    reasons.push("Verification evidence is required.");
  }
  if (!hasText(input.evidence.gitDiffReference)) {
    reasons.push("A Git diff reference is required.");
  }
  if (!input.evidence.allowedPathsVerified) {
    reasons.push("Allowed paths must be verified.");
  }
  if (!input.evidence.verificationPassed) {
    reasons.push("Verification commands must pass.");
  }
  if (input.evidence.unresolvedViolations.length > 0) {
    reasons.push("Unresolved rule violations prevent completion.");
  }
  if (!input.evidence.reviewerApproved) {
    reasons.push("Reviewer approval is required.");
  }
  if (input.blockingIssues.some(hasOpenIssue)) {
    reasons.push("Open blocking issues prevent completion.");
  }

  return reasons.length === 0
    ? { accepted: true, reasons: [] }
    : { accepted: false, reasons };
}

export function completeTaskIfEligible(
  input: CompletionInput,
): DomainResult<Task> {
  const decision = evaluateTaskCompletion(input);
  if (!decision.accepted) {
    return recordFailure("completion_not_allowed", decision.reasons.join(" "));
  }

  const transition = transitionTask(input.task, "completed");
  if (!transition.ok) {
    return transition;
  }
  return { ok: true, value: transition.value.task };
}
