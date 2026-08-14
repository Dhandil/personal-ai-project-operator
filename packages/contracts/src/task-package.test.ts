import { describe, expect, it } from "vitest";

import {
  executorOutputSchema,
  outputSchemaIdForRole,
  reviewerOutputSchema,
  validateStructuredAgentOutput,
} from "./task-package.js";

const executorOutput = {
  schemaVersion: 1,
  kind: "executor_result",
  taskId: "TASK-037",
  status: "completed",
  summary: "Generated a bounded task package.",
  changedPaths: ["packages/contracts/src/task-package.ts"],
  verification: {
    commands: ["npm run verify"],
    results: [
      {
        command: "npm run verify",
        status: "passed",
        evidence: ["all checks passed"],
      },
    ],
  },
  evidence: ["task-package.test.ts"],
  commit: "abc1234",
  outstandingIssues: [],
  handoff: "Reviewer can inspect the package contract.",
};

const reviewerOutput = {
  schemaVersion: 1,
  kind: "reviewer_result",
  taskId: "TASK-037",
  decision: "accepted",
  findings: [],
  verificationEvidence: ["fixed fixture snapshot"],
  requiredChanges: [],
  handoff: "Return the accepted result to the project lead.",
};

describe("task package output schemas", () => {
  it("keeps executor and reviewer schemas distinct", () => {
    expect(executorOutputSchema.safeParse(executorOutput).success).toBe(true);
    expect(reviewerOutputSchema.safeParse(reviewerOutput).success).toBe(true);
    expect(executorOutputSchema.safeParse(reviewerOutput).success).toBe(false);
    expect(reviewerOutputSchema.safeParse(executorOutput).success).toBe(false);
    expect(outputSchemaIdForRole("executor")).toBe("executor_result_v1");
    expect(outputSchemaIdForRole("reviewer")).toBe("reviewer_result_v1");
  });

  it("rejects unknown fields and reports structured validation details", () => {
    const invalid = validateStructuredAgentOutput("executor", {
      ...executorOutput,
      unexpected: true,
    });
    expect(invalid.ok).toBe(false);
    expect(invalid.output).toBeNull();
    expect(invalid.details.join(" ")).toContain("unexpected");
  });
});
