import { expect, test } from "@playwright/test";

const projectKey = "a".repeat(64);

test("history distinguishes facts, generated snapshots, and audit events", async ({
  page,
}) => {
  await page.route(/\/api\/projects$/, async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        value: {
          projects: [],
          currentProjectKey: projectKey,
          selectionState: "selected",
        },
      }),
    }),
  );
  await page.route(/\/api\/projects\/history\?.*$/, async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        value: {
          projectKey,
          entries: [
            {
              kind: "fact",
              id: "GOAL-001",
              relativePath: ".personal-workspace/goals/GOAL-001.md",
              revision: 1,
              hash: "goal-hash",
              occurredAt: "2026-08-14T10:00:00Z",
              summary: "Target",
            },
            {
              kind: "generated_snapshot",
              id: "status.md",
              relativePath: ".personal-workspace/status.md",
              revision: 3,
              hash: "status-hash",
              occurredAt: "2026-08-14T10:01:00Z",
              summary: "Generated current status snapshot",
            },
            {
              kind: "audit_event",
              id: "EXEC-001",
              relativePath: ".personal-workspace/audit/events.jsonl",
              revision: null,
              hash: null,
              occurredAt: "2026-08-14T10:02:00Z",
              summary: "project_recovered_from_facts",
            },
          ],
        },
      }),
    }),
  );
  await page.goto("/projects/history");
  await expect(
    page.getByRole("heading", { name: "重启恢复与历史查看" }),
  ).toBeVisible();
  await expect(page.getByText("事实 · GOAL-001")).toBeVisible();
  await expect(page.getByText("生成快照 · status.md")).toBeVisible();
  await expect(page.getByText("审计事件 · EXEC-001")).toBeVisible();
});
