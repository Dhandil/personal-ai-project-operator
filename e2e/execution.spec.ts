import { expect, test } from "@playwright/test";

const projectKey = "a".repeat(64);
const recovery = {
  required: true,
  executionId: "EXEC-045",
  taskId: "TASK-045",
  sessionId: "session-045",
  reason: "后端重启导致执行中断，等待用户决定如何恢复。",
  choices: ["resume", "retry", "cancel"],
};
const interruptedRun = {
  executionId: "EXEC-045",
  projectKey,
  taskId: "TASK-045",
  goalId: "GOAL-009",
  role: "executor",
  status: "interrupted",
  taskStatus: "paused",
  startedAt: "2026-08-15T00:00:00.000Z",
  completedAt: null,
  events: [],
  result: { error: "backend restarted" },
  recovery,
};

function response(value: unknown): {
  status: number;
  contentType: string;
  body: string;
} {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, value }),
  };
}

test("execution console restores recovery context after reload and records a decision", async ({
  page,
}) => {
  let resumed = false;
  await page.route(/\/api\/projects$/, async (route) =>
    route.fulfill(
      response({
        projects: [],
        currentProjectKey: projectKey,
        selectionState: "selected",
      }),
    ),
  );

  await page.route(/\/api\/projects\/execution\?.*$/, async (route) =>
    route.fulfill(
      response(
        resumed
          ? {
              active: false,
              run: {
                ...interruptedRun,
                status: "completed",
                taskStatus: "in_review",
                completedAt: "2026-08-15T00:02:00.000Z",
                result: { summary: "resume completed; awaiting review" },
                recovery: null,
              },
              recovery: null,
            }
          : { active: false, run: interruptedRun, recovery },
      ),
    ),
  );

  await page.route(/\/api\/projects\/reports\?.*$/, async (route) =>
    route.fulfill(
      response({
        projectKey,
        reports: [
          {
            id: "REPORT-045",
            kind: "recovery",
            title: "执行中断，等待恢复",
            summary: "后端重启后保留了执行上下文。",
            relatedObjectIds: ["EXEC-045", "TASK-045"],
            evidence: [
              {
                source: ".personal-workspace/audit/events.jsonl",
                eventId: "EXEC-045",
                action: "execution_interrupted",
              },
            ],
            occurredAt: "2026-08-15T00:01:00.000Z",
          },
        ],
      }),
    ),
  );

  let eventConnections = 0;
  await page.route("**/api/projects/events**", async (route) => {
    eventConnections += 1;
    if (eventConnections === 1) {
      await route.fulfill({
        status: 503,
        contentType: "text/plain",
        body: "temporary event stream failure",
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `: connected\n\nid: REPORT-045-LIVE\nevent: report\ndata: ${JSON.stringify(
        {
          id: "REPORT-045-LIVE",
          kind: "progress",
          title: "执行连接已恢复",
          summary: "SSE 重连后继续接收实时进度。",
          relatedObjectIds: ["EXEC-045"],
          evidence: [],
          occurredAt: "2026-08-15T00:01:30.000Z",
        },
      )}\n\n`,
    });
  });

  await page.route("**/api/projects/execution/resume", async (route) =>
    route.fulfill(
      (() => {
        resumed = true;
        return response({
          projectKey,
          run: {
            ...interruptedRun,
            status: "completed",
            taskStatus: "in_review",
            completedAt: "2026-08-15T00:02:00.000Z",
            result: { summary: "resume completed; awaiting review" },
            recovery: null,
          },
        });
      })(),
    ),
  );

  await page.goto("/projects/execution");
  await expect(page.getByRole("heading", { name: "执行控制台" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "需要恢复决策" }),
  ).toBeVisible();
  await expect(page.getByText(recovery.reason)).toBeVisible();
  await expect(page.getByText("TASK-045").first()).toBeVisible();
  await expect.poll(() => eventConnections).toBeGreaterThan(1);
  await expect(page.getByText("执行连接已恢复")).toBeVisible();
  await page.getByRole("button", { name: "恢复执行" }).click();
  await expect(page.getByText("已记录恢复执行决定。")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Agent 已完成，等待审核")).toBeVisible();
  await expect(page.getByText("任务已完成")).not.toBeVisible();
});
