import { describe, expect, it } from "vitest";

import {
  decidePlanningDraft,
  requestPlanningDraft,
  requestStageState,
} from "./planning";

const projectKey = "a".repeat(64);

const state = {
  projectRoot: "D:\\Projects\\demo",
  active: false,
  currentStage: "idea",
  currentRun: null,
  runs: [],
  recoveryRequired: false,
  approvalRequired: false,
};

function response(value: unknown): Response {
  return new Response(JSON.stringify({ ok: true, value }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("planning console API contracts", () => {
  it("parses stage state and keeps the current project in the request", async () => {
    let requested = "";
    const result = await requestStageState(projectKey, async (input) => {
      requested = String(input);
      return response(state);
    });

    expect(result.ok).toBe(true);
    expect(requested).toBe(`/api/projects/stages?projectKey=${projectKey}`);
  });

  it("accepts an absent planning draft as a recoverable empty state", async () => {
    const result = await requestPlanningDraft(projectKey, async () =>
      response(null),
    );

    expect(result).toEqual({ ok: true, value: null });
  });

  it("keeps approval as a distinct user action and parses its task handoff", async () => {
    const calls: string[] = [];
    const result = await decidePlanningDraft(
      "approve",
      {
        projectKey,
        revision: 2,
        hash: "sha256:draft",
        note: "User approved the plan.",
      },
      async (input) => {
        calls.push(String(input));
        return response({
          projectKey,
          goalIds: ["GOAL-013"],
          taskIds: ["TASK-060"],
          readyTaskId: "TASK-060",
        });
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok && "readyTaskId" in result.value) {
      expect(result.value.readyTaskId).toBe("TASK-060");
    }
    expect(calls).toEqual(["/api/projects/planning-draft/approve"]);
  });

  it("does not treat malformed stage state as a successful response", async () => {
    const result = await requestStageState(projectKey, async () =>
      response({ active: true }),
    );

    expect(result.ok).toBe(false);
  });
});
