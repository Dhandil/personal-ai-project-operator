import { describe, expect, it } from "vitest";

import { parseTasksPayload } from "./task";

describe("task API contract", () => {
  it("keeps dependencies, role assignment, and lightweight custom fields", () => {
    const value = parseTasksPayload({
      projectKey: "a".repeat(64),
      projectRoot: "D:\\project",
      tasks: [
        {
          task: {
            id: "TASK-001",
            title: "Task facts",
            status: "draft",
            goalId: "GOAL-001",
            currentRole: "executor",
            dependencies: ["TASK-002"],
            purpose: "Keep facts complete.",
            scope: ["server"],
            outputs: ["API"],
            acceptanceCriteria: ["valid"],
            requiredFiles: ["apps/server"],
            onDemandFiles: ["README.md"],
            associatedDecisions: [],
            allowedPaths: ["apps/server"],
            forbiddenPaths: [".git"],
            run: {},
            evidence: ["test"],
            customFieldDefinitions: [{ key: "priority", type: "text" }],
            customFields: { priority: "high" },
            completion: {},
          },
          revision: 1,
          hash: "hash",
        },
      ],
    });
    expect(value?.tasks[0]?.task.dependencies).toEqual(["TASK-002"]);
    expect(value?.tasks[0]?.task.currentRole).toBe("executor");
    expect(value?.tasks[0]?.task.customFields.priority).toBe("high");
  });
});
