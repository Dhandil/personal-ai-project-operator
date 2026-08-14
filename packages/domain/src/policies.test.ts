import { describe, expect, it } from "vitest";

import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";

import { createApproval, decideApproval } from "./approval.js";
import { requireApprovalGate } from "./approval-policy.js";
import {
  completeTaskIfEligible,
  evaluateTaskCompletion,
  type CompletionInput,
} from "./completion-policy.js";
import { createGoalProposal, decideGoal, startGoal } from "./goal.js";
import { deriveIssuePausePlan } from "./issue-impact-policy.js";
import { createIssue } from "./issue.js";
import { createTaskDraft, type Task, type TaskInput } from "./task.js";
import { canTransitionTask, transitionTask } from "./task-transition.js";

const timestamp = parseUtcIsoTimestamp("2026-08-14T00:00:00Z");

const taskInput: TaskInput = {
  id: "TASK-009",
  title: "Implement policy strategies",
  currentRole: "executor",
  dependencies: ["TASK-006", "TASK-007", "TASK-008"],
  purpose:
    "Enforce task transitions, approval gates, issue impact, and completion evidence.",
  scope: ["domain policy models"],
  outputs: ["policy modules"],
  acceptanceCriteria: ["invalid transitions are rejected"],
  requiredFiles: ["packages/domain/src"],
  onDemandFiles: [".personal-workspace/stages/03-spec/03-spec.md"],
  associatedDecisions: [],
  allowedPaths: ["packages/domain/src"],
  forbiddenPaths: ["apps/server/src"],
  run: {
    mode: "local",
    gitBranch: "goal/GOAL-001",
    worktree: "primary",
    verificationCommands: ["npm run test:unit -- policies"],
  },
  evidence: ["policy test output"],
  completion: {
    output: "Policy strategies are exported.",
    tests: ["policies"],
    outstandingIssues: [],
    handoff: "Ready for review.",
  },
};

function makeGoal() {
  const proposal = createGoalProposal({
    id: "GOAL-002",
    title: "Deliver governance policies",
    boundary: ["domain policy models"],
    risks: [],
    acceptanceCriteria: ["completion is evidence based"],
  });
  expect(proposal.ok).toBe(true);
  if (!proposal.ok) {
    throw new Error(proposal.error.message);
  }
  const approved = decideGoal(proposal.value, {
    approved: true,
    decidedAt: timestamp,
  });
  expect(approved.ok).toBe(true);
  if (!approved.ok) {
    throw new Error(approved.error.message);
  }
  const started = startGoal(approved.value);
  expect(started.ok).toBe(true);
  if (!started.ok) {
    throw new Error(started.error.message);
  }
  return started.value;
}

function makeTask(goal = makeGoal()): Task {
  const draft = createTaskDraft(goal, taskInput);
  expect(draft.ok).toBe(true);
  if (!draft.ok) {
    throw new Error(draft.error.message);
  }
  const ready = transitionTask(draft.value, "ready");
  expect(ready.ok).toBe(true);
  if (!ready.ok) {
    throw new Error(ready.error.message);
  }
  const inProgress = transitionTask(ready.value.task, "in_progress");
  expect(inProgress.ok).toBe(true);
  if (!inProgress.ok) {
    throw new Error(inProgress.error.message);
  }
  const inReview = transitionTask(inProgress.value.task, "in_review");
  expect(inReview.ok).toBe(true);
  if (!inReview.ok) {
    throw new Error(inReview.error.message);
  }
  return inReview.value.task;
}

function makeAcceptanceApproval() {
  const pending = createApproval({
    id: "TASK-009",
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    relatedObjectIds: ["GOAL-002"],
    approvalType: "short_term_goal_acceptance_and_main_merge",
    subjectId: "GOAL-002",
    requestedBy: "agent",
    request: "Accept the completed short-term goal and merge its branch.",
  });
  expect(pending.ok).toBe(true);
  if (!pending.ok) {
    throw new Error(pending.error.message);
  }
  const decided = decideApproval(pending.value, {
    decidedBy: "user",
    outcome: "approved",
    decidedAt: timestamp,
    note: "Evidence is sufficient.",
  });
  expect(decided.ok).toBe(true);
  if (!decided.ok) {
    throw new Error(decided.error.message);
  }
  return decided.value;
}

function makeEvidence(): CompletionInput["evidence"] {
  return {
    actualOutputs: ["packages/domain/src/task-transition.ts"],
    commandsRun: ["npm run verify"],
    verificationEvidence: ["35 unit tests passed"],
    gitDiffReference: "commit:task-009",
    allowedPathsVerified: true,
    verificationPassed: true,
    unresolvedViolations: [],
    reviewerApproved: true,
  };
}

describe("policy strategies", () => {
  it("allows only the defined task status paths and records reasons", () => {
    expect(canTransitionTask("draft", "ready")).toBe(true);
    expect(canTransitionTask("completed", "in_progress")).toBe(false);

    const task = makeTask();
    const paused = transitionTask(task, "paused");
    expect(paused).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "reason_required" }),
    });
    const blocked = transitionTask(
      task,
      "paused",
      "Waiting for user decision.",
    );
    expect(blocked.ok).toBe(true);
    if (blocked.ok) {
      expect(blocked.value.audit.fromStatus).toBe("in_review");
      expect(blocked.value.audit.toStatus).toBe("paused");
    }
  });

  it("requires an accepted user approval for an approval gate", () => {
    const request = {
      approvalType: "short_term_goal_start" as const,
      subjectId: "GOAL-002" as const,
      approvals: [],
    };
    expect(requireApprovalGate(request)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "approval_required" }),
    });
  });

  it("pauses only affected tasks, but pauses the chain for unknown impact", () => {
    const known = createIssue({
      id: "TASK-009",
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      relatedObjectIds: [],
      title: "Task blocker",
      description: "One task needs a decision.",
      severity: "high",
      impact: "task",
      affectedTaskIds: ["TASK-009"],
      affectedObjectIds: [],
      discussion: [],
      recoveryPlan: "Resume after decision.",
    });
    expect(known.ok).toBe(true);
    if (!known.ok) {
      throw new Error(known.error.message);
    }
    const knownPlan = deriveIssuePausePlan(known.value);
    expect(knownPlan.ok).toBe(true);
    if (knownPlan.ok) {
      expect(knownPlan.value.pauseTaskIds).toEqual(["TASK-009"]);
      expect(knownPlan.value.pauseExecutionChain).toBe(false);
    }

    const unknown = createIssue({
      ...known.value,
      id: "TASK-010",
      impact: "unknown",
      affectedTaskIds: [],
    });
    expect(unknown.ok).toBe(true);
    if (unknown.ok) {
      const unknownPlan = deriveIssuePausePlan(unknown.value);
      expect(unknownPlan.ok).toBe(true);
      if (unknownPlan.ok) {
        expect(unknownPlan.value.pauseTaskIds).toEqual([]);
        expect(unknownPlan.value.pauseExecutionChain).toBe(true);
      }
    }
  });

  it("rejects completion when goal approval, gate, evidence, or review is missing", () => {
    const task = makeTask();
    const input: CompletionInput = {
      goal: makeGoal(),
      task,
      approvals: [],
      blockingIssues: [],
      evidence: { ...makeEvidence(), reviewerApproved: false },
    };
    const result = evaluateTaskCompletion(input);

    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reasons).toEqual(
        expect.arrayContaining([
          "Accepted user approval is required before completion.",
          "Reviewer approval is required.",
        ]),
      );
    }
  });

  it("completes a task only after all evidence and approvals pass", () => {
    const goal = makeGoal();
    const task = makeTask(goal);
    const input: CompletionInput = {
      goal,
      task,
      approvals: [makeAcceptanceApproval()],
      blockingIssues: [],
      evidence: makeEvidence(),
    };

    const decision = evaluateTaskCompletion(input);
    expect(decision).toEqual({ accepted: true, reasons: [] });
    const completed = completeTaskIfEligible(input);
    expect(completed.ok).toBe(true);
    if (completed.ok) {
      expect(completed.value.status).toBe("completed");
    }
  });
});
