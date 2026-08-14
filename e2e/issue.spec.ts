import { expect, test } from "@playwright/test";

const projectKey = "a".repeat(64);
const issue = {
  issue: {
    id: "DEC-001",
    status: "in_progress",
    title: "Dependency unavailable",
    description: "The task is paused.",
    severity: "high",
    impact: "task",
    affectedTaskIds: ["TASK-001"],
    affectedObjectIds: [],
    discussion: ["Agent analysis recorded."],
    decisionIds: [],
    recoveryPlan: "Restore dependency.",
    resolution: null,
  },
  revision: 1,
  hash: "hash",
};
test("issue page shows pause scope and preserves user decision flow", async ({
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
  await page.route(/\/api\/projects\/issues\?.*$/, async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        value: {
          projectKey,
          projectRoot: "D:\\project",
          issues: [],
          decisions: [],
        },
      }),
    }),
  );
  await page.route("**/api/projects/issues", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        value: {
          projectKey,
          issue,
          decision: null,
          pausedTaskIds: ["TASK-001"],
          missingTaskIds: [],
          executionChainPaused: false,
        },
      }),
    }),
  );
  await page.goto("/projects/issues");
  await expect(
    page.getByRole("heading", { name: "Issue coordination" }),
  ).toBeVisible();
  await page.getByLabel("title").fill("Dependency unavailable");
  await page.getByLabel("description").fill("The task is paused.");
  await page.getByLabel("Discussion").fill("Agent analysis recorded.");
  await page.getByRole("button", { name: "Record issue and pause" }).click();
  await expect(
    page.getByText("Issue recorded; the applicable execution scope is paused."),
  ).toBeVisible();
  await expect(
    page.getByText("Known impact: affected tasks TASK-001."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Decide and preserve rationale" }),
  ).toBeVisible();
});
