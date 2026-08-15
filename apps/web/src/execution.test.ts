import { describe, expect, it } from "vitest";

import {
  parseExecutionStatePayload,
  requestExecutionAction,
  type ExecutionRun,
} from "./execution";

const run: ExecutionRun = {
  executionId: "EXEC-045",
  projectKey: "a".repeat(64),
  taskId: "TASK-045",
  goalId: "GOAL-009",
  role: "executor",
  status: "interrupted",
  taskStatus: "paused",
  startedAt: "2026-08-15T00:00:00.000Z",
  completedAt: null,
  events: [],
  result: null,
  recovery: {
    required: true,
    executionId: "EXEC-045",
    taskId: "TASK-045",
    sessionId: "session-045",
    reason: "backend restarted",
    choices: ["resume", "retry", "cancel"],
  },
};

describe("execution api contracts", () => {
  it("parses an interrupted execution with recovery choices", () => {
    expect(
      parseExecutionStatePayload({
        active: false,
        run,
        recovery: run.recovery,
      }),
    ).toEqual({ active: false, run, recovery: run.recovery });
  });

  it("rejects a recovery object with an incomplete choice list", () => {
    expect(
      parseExecutionStatePayload({
        active: false,
        run: {
          ...run,
          recovery: { ...run.recovery, choices: ["resume"] },
        },
        recovery: { ...run.recovery, choices: ["resume"] },
      }),
    ).toBeNull();
  });

  it("posts a recovery decision with the persisted execution id", async () => {
    const request: { current: Request | null } = { current: null };
    const result = await requestExecutionAction(
      {
        projectKey: run.projectKey,
        executionId: run.executionId,
        action: "resume",
      },
      async (input, init) => {
        request.current = new Request(
          new URL(input.toString(), "http://localhost"),
          init,
        );
        return Response.json({
          ok: true,
          value: {
            projectKey: run.projectKey,
            run: { ...run, status: "running", recovery: null },
          },
        });
      },
    );

    expect(result.ok).toBe(true);
    expect(request.current?.url).toContain("/api/projects/execution/resume");
    expect(request.current?.method).toBe("POST");
    expect(await request.current?.json()).toEqual({
      projectKey: run.projectKey,
      executionId: run.executionId,
    });
  });
});
