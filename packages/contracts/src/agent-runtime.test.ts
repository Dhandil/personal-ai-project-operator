import { describe, expect, it } from "vitest";

import {
  agentEventTypes,
  agentFailureCodes,
  agentResultStatuses,
} from "./agent-runtime.js";

describe("agent runtime contracts", () => {
  it("exposes vendor-neutral lifecycle events and terminal results", () => {
    expect(agentEventTypes).toEqual([
      "started",
      "progress",
      "output",
      "completed",
      "failed",
      "interrupted",
      "privilege_violation",
      "review_failed",
      "error_output",
    ]);
    expect(agentResultStatuses).toEqual([
      "completed",
      "failed",
      "interrupted",
      "privilege_violation",
      "review_failed",
      "invalid_output",
    ]);
    expect(agentFailureCodes).not.toContain("codex");
    expect(agentFailureCodes).not.toContain("cli");
    expect(agentFailureCodes).not.toContain("thread_id");
  });
});
