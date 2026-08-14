import { describe, expect, it } from "vitest";

import { parseReportPage } from "./report";

describe("report API contract", () => {
  it("requires evidence for the displayed execution report", () => {
    const value = parseReportPage({
      projectKey: "a".repeat(64),
      reports: [
        {
          id: "REPORT-001",
          kind: "completion",
          title: "Execution completed",
          summary: "task completed",
          relatedObjectIds: ["TASK-001"],
          evidence: [
            {
              source: ".personal-workspace/audit/events.jsonl",
              eventId: "EXEC-001",
              action: "task_completed",
            },
          ],
          occurredAt: "2026-08-14T10:00:00Z",
        },
      ],
    });
    expect(value?.reports[0]?.evidence[0]?.eventId).toBe("EXEC-001");
  });
});
