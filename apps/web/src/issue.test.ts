import { describe, expect, it } from "vitest";

import { parseIssuesPayload } from "./issue";

describe("issue API contract", () => {
  it("preserves impact scope, discussion and linked decisions", () => {
    const value = parseIssuesPayload({
      projectKey: "a".repeat(64),
      projectRoot: "D:\\project",
      issues: [
        {
          issue: {
            id: "DEC-001",
            status: "in_progress",
            title: "Blocked task",
            description: "Dependency unavailable",
            severity: "high",
            impact: "task",
            affectedTaskIds: ["TASK-001"],
            affectedObjectIds: [],
            discussion: ["Agent analysis"],
            decisionIds: ["DEC-002"],
            recoveryPlan: "Restore dependency",
            resolution: null,
          },
          revision: 1,
          hash: "hash",
        },
      ],
      decisions: [],
    });
    expect(value?.issues[0]?.issue.affectedTaskIds).toEqual(["TASK-001"]);
    expect(value?.issues[0]?.issue.discussion).toEqual(["Agent analysis"]);
    expect(value?.issues[0]?.issue.decisionIds).toEqual(["DEC-002"]);
  });
});
