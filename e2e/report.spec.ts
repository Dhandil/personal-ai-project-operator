import { expect, test } from "@playwright/test";

const projectKey = "a".repeat(64);
test("reports page shows audit evidence and editable summary interval", async ({
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
  await page.route(/\/api\/projects\/reports\?.*$/, async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        value: {
          projectKey,
          reports: [
            {
              id: "REPORT-001",
              kind: "completion",
              title: "Execution completed",
              summary: "task_completed: evidence=verified.",
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
        },
      }),
    }),
  );
  await page.route(/\/api\/projects\/settings\?.*$/, async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        value: { projectKey, intervalMinutes: 10, source: "default" },
      }),
    }),
  );
  const liveReport = (id: string, kind: string, title: string): string =>
    `id: ${id}\nevent: report\ndata: ${JSON.stringify({ id, kind, title, summary: `${kind}: live`, relatedObjectIds: [], evidence: [{ source: ".personal-workspace/audit/events.jsonl", eventId: id.replace("REPORT", "EXEC"), action: kind }], occurredAt: "2026-08-14T10:00:00Z" })}\n\n`;
  await page.route("**/api/projects/events**", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `${liveReport("REPORT-011", "blocker", "Execution blocked")}${liveReport("REPORT-012", "recovery", "Execution recovered")}`,
    }),
  );
  await page.goto("/projects/reports");
  await expect(
    page.getByRole("heading", { name: "Execution reports" }),
  ).toBeVisible();
  await expect(page.getByText("Execution completed")).toBeVisible();
  await expect(page.getByText(/Evidence: .*EXEC-001/)).toBeVisible();
  await expect(page.getByText("Execution blocked")).toBeVisible();
  await expect(page.getByText("Execution recovered")).toBeVisible();
  await expect(page.getByLabel("Summary interval minutes")).toHaveValue("10");
});
