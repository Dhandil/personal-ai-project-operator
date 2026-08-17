import { describe, expect, it } from "vitest";

import {
  firstDependencyFreeTask,
  validatePlanningDraft,
  type PlanningDraft,
} from "./planning-draft.js";

const baseDraft: PlanningDraft = {
  schemaVersion: 1,
  kind: "planning_draft",
  specRevision: 1,
  specHash: "sha256:spec",
  goalDrafts: [
    {
      id: "GOAL-099",
      title: "Generated goal",
      boundary: ["one bounded outcome"],
      risks: [],
      acceptanceCriteria: ["verified"],
    },
  ],
  roleDrafts: [
    {
      key: "executor",
      title: "Executor",
      responsibilities: ["implement"],
      mustRead: ["task card"],
      onDemandRead: ["decisions"],
      allowedActions: ["change allowed paths"],
      forbiddenActions: ["self-approve"],
      handoff: ["changed files"],
    },
  ],
  taskDrafts: [
    {
      id: "TASK-099",
      title: "First generated task",
      goalId: "GOAL-099",
      currentRole: "executor",
      dependencies: [],
      purpose: "Implement the bounded outcome.",
      scope: ["implementation"],
      outputs: ["verified output"],
      acceptanceCriteria: ["tests pass"],
      requiredFiles: [".personal-workspace/stages/03-spec/03-spec.md"],
      onDemandFiles: [".personal-workspace/project.md"],
      allowedPaths: ["apps"],
      forbiddenPaths: [".git"],
      verificationCommands: ["npm run verify"],
    },
  ],
  dependencyGraph: { "TASK-099": [] },
  handoff: "Review and approve before formal facts are written.",
};

describe("planning draft model", () => {
  it("validates a complete draft and identifies its first task", () => {
    const result = validatePlanningDraft(baseDraft);

    expect(result.ok).toBe(true);
    expect(firstDependencyFreeTask(baseDraft)).toBe("TASK-099");
  });

  it.each([
    [
      "missing dependency",
      { dependencies: ["TASK-098"], graph: ["TASK-098"] },
      "missing_dependency",
    ],
    ["duplicate task", { duplicate: true }, "duplicate_id"],
    ["cycle", { cycle: true }, "circular_dependency"],
    ["path traversal", { allowedPaths: ["apps/../.git"] }, "invalid_path"],
    ["unknown role", { currentRole: "unknown-role" }, "unknown_role"],
  ] as const)("rejects %s", (_label, change, code) => {
    let candidate = structuredClone(baseDraft) as PlanningDraft;
    if ("dependencies" in change) {
      candidate = {
        ...candidate,
        taskDrafts: [
          { ...candidate.taskDrafts[0], dependencies: change.dependencies },
        ],
        dependencyGraph: { "TASK-099": change.graph },
      } as PlanningDraft;
    }
    if ("duplicate" in change) {
      candidate = {
        ...candidate,
        taskDrafts: [...candidate.taskDrafts, candidate.taskDrafts[0]],
      };
    }
    if ("cycle" in change) {
      candidate = {
        ...candidate,
        taskDrafts: [
          { ...candidate.taskDrafts[0], dependencies: ["TASK-100"] },
          {
            ...candidate.taskDrafts[0],
            id: "TASK-100",
            dependencies: ["TASK-099"],
          },
        ],
        dependencyGraph: { "TASK-099": ["TASK-100"], "TASK-100": ["TASK-099"] },
      } as PlanningDraft;
    }
    if ("allowedPaths" in change) {
      candidate = {
        ...candidate,
        taskDrafts: [
          { ...candidate.taskDrafts[0], allowedPaths: change.allowedPaths },
        ],
      } as PlanningDraft;
    }
    if ("currentRole" in change) {
      candidate = {
        ...candidate,
        taskDrafts: [
          { ...candidate.taskDrafts[0], currentRole: change.currentRole },
        ],
      } as PlanningDraft;
    }

    const result = validatePlanningDraft(candidate);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
  });
});
