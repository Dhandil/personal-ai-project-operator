import { expect, test } from "@playwright/test";

const projectKey = "a".repeat(64);
const draft = {
  goal: {
    id: "GOAL-001",
    title: "First slice",
    boundary: ["Original boundary"],
    risks: [],
    acceptanceCriteria: ["Original criterion"],
    proposedBy: "project-lead-agent",
    status: "draft",
    approval: null,
  },
  taskDrafts: [],
  revision: 0,
  hash: "",
};

test("goal page separates proposal review from approval", async ({ page }) => {
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
  await page.route(/\/api\/projects\/goals\?.*$/, async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        value: { projectKey, projectRoot: "D:\\project", goals: [] },
      }),
    }),
  );
  await page.route("**/api/projects/goals/propose", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        value: { projectKey, proposal: draft },
      }),
    }),
  );
  await page.route("**/api/projects/goals/decision", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        value: {
          projectKey,
          changed: true,
          goal: {
            ...draft,
            goal: {
              ...draft.goal,
              boundary: ["Edited boundary"],
              acceptanceCriteria: ["Edited criterion"],
              status: "ready",
              approval: {
                decidedBy: "user",
                approved: true,
                decidedAt: "2026-08-14T08:00:00Z",
              },
            },
            revision: 1,
            hash: "hash",
          },
        },
      }),
    }),
  );

  await page.goto("/projects/goals");
  await expect(
    page.getByRole("heading", { name: "Goal approval" }),
  ).toBeVisible();
  await page.getByLabel("Goal title").fill("First slice");
  await page.getByLabel("Boundary").fill("Original boundary");
  await page.getByLabel("Acceptance criteria").fill("Original criterion");
  await page.getByRole("button", { name: "Generate proposal" }).click();
  await expect(page.getByText("Review GOAL-001 before approval")).toBeVisible();
  await page.getByLabel("Boundary").fill("Edited boundary");
  await page.getByLabel("Acceptance criteria").fill("Edited criterion");
  await page.getByRole("button", { name: "Approve goal" }).click();
  await expect(
    page.getByText("Goal approved and ready; execution has not started."),
  ).toBeVisible();
  await expect(
    page.getByText("Boundary: Edited boundary", { exact: true }),
  ).toBeVisible();
});
