import { describe, expect, it } from "vitest";

import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";

import { createGoalProposal, decideGoal, type Goal } from "./goal.js";
import {
  isExecutableTask,
  markTaskReady,
  createTaskDraft,
  updateTask,
  type TaskInput,
} from "./task.js";

const decidedAt = parseUtcIsoTimestamp("2026-08-14T00:00:00Z");

const taskInput: TaskInput = {
  id: "TASK-007",
  title: "Implement domain models",
  currentRole: "executor",
  dependencies: ["TASK-005", "TASK-006"],
  purpose: "Represent goals, roles, and formal task cards.",
  scope: ["domain package"],
  outputs: ["goal model", "role model", "task model"],
  acceptanceCriteria: ["unapproved goals cannot produce executable tasks"],
  requiredFiles: ["packages/domain/src"],
  onDemandFiles: [".personal-workspace/stages/03-spec/03-spec.md"],
  associatedDecisions: [],
  allowedPaths: ["packages/domain/src"],
  forbiddenPaths: ["apps/server/src"],
  run: {
    mode: "local",
    gitBranch: "goal/GOAL-001",
    worktree: "primary",
    verificationCommands: ["npm run test:unit -- goal role task"],
  },
  evidence: ["unit test output"],
  completion: {
    output: "Domain models are exported.",
    tests: ["goal", "role", "task"],
    outstandingIssues: [],
    handoff: "Ready for API integration.",
  },
};

function makeGoal(): Goal {
  const proposal = createGoalProposal({
    id: "GOAL-002",
    title: "Deliver the first short-term goal",
    boundary: ["domain models"],
    risks: [],
    acceptanceCriteria: ["models are strict"],
  });
  expect(proposal.ok).toBe(true);
  if (!proposal.ok) {
    throw new Error(proposal.error.message);
  }
  return proposal.value;
}

describe("task model", () => {
  it("creates a complete immutable task draft", () => {
    const result = createTaskDraft(makeGoal(), taskInput);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("draft");
      expect(result.value.goalId).toBe("GOAL-002");
      expect(result.value.requiredFiles).toEqual(["packages/domain/src"]);
      expect(isExecutableTask(result.value)).toBe(false);
    }
  });

  it("does not make a task executable until the goal is user-approved", () => {
    const draft = createTaskDraft(makeGoal(), taskInput);
    expect(draft.ok).toBe(true);
    if (!draft.ok) {
      throw new Error(draft.error.message);
    }

    const blocked = markTaskReady(makeGoal(), draft.value);
    expect(blocked).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "goal_not_approved" }),
    });

    const decided = decideGoal(makeGoal(), { approved: true, decidedAt });
    expect(decided.ok).toBe(true);
    if (!decided.ok) {
      throw new Error(decided.error.message);
    }
    const ready = markTaskReady(decided.value, draft.value);
    expect(ready.ok).toBe(true);
    if (ready.ok) {
      expect(ready.value.status).toBe("ready");
      expect(isExecutableTask(ready.value)).toBe(true);
    }
  });

  it("updates optional content without allowing required fields to disappear", () => {
    const draft = createTaskDraft(makeGoal(), taskInput);
    expect(draft.ok).toBe(true);
    if (!draft.ok) {
      throw new Error(draft.error.message);
    }

    const updated = updateTask(draft.value, { title: "Refined domain models" });
    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.value.title).toBe("Refined domain models");
      expect(updated.value.goalId).toBe("GOAL-002");
      expect(updated.value.acceptanceCriteria).toEqual(
        taskInput.acceptanceCriteria,
      );
      expect(updated.value.run.verificationCommands).toEqual(
        taskInput.run.verificationCommands,
      );
    }
  });
});
