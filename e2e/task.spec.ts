import { expect, test } from "@playwright/test";

const projectKey = "a".repeat(64);
const task = {
  task: {
    id: "TASK-001",
    title: "Task facts",
    status: "draft",
    goalId: "GOAL-001",
    currentRole: "executor",
    dependencies: [],
    purpose: "Keep facts complete.",
    scope: ["server"],
    outputs: ["API"],
    acceptanceCriteria: ["valid"],
    requiredFiles: ["apps/server"],
    onDemandFiles: ["README.md"],
    associatedDecisions: [],
    allowedPaths: ["apps/server"],
    forbiddenPaths: [".git"],
    run: { verificationCommands: ["npm run verify"] },
    evidence: ["integration test"],
    customFieldDefinitions: [],
    customFields: { priority: "high" },
    completion: {},
  },
  revision: 1,
  hash: "hash",
};

test("task page supports complete task drafts, dependency display, and role assignment", async ({
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
  await page.route(/\/api\/projects\/tasks\?.*$/, async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        value: { projectKey, projectRoot: "D:\\project", tasks: [] },
      }),
    }),
  );
  await page.route("**/api/projects/tasks", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, value: task }),
    }),
  );
  await page.goto("/projects/tasks");
  await expect(
    page.getByRole("heading", { name: "Tasks and dependencies" }),
  ).toBeVisible();
  await page.getByLabel("title").fill("Task facts");
  await page.getByLabel("purpose").fill("Keep facts complete.");
  await page.getByLabel("scope").fill("server");
  await page.getByLabel("outputs").fill("API");
  await page.getByLabel("acceptanceCriteria").fill("valid");
  await page.getByLabel("requiredFiles").fill("apps/server");
  await page.getByLabel("onDemandFiles").fill("README.md");
  await page.getByLabel("allowedPaths").fill("apps/server");
  await page.getByLabel("verificationCommands").fill("npm run verify");
  await page.getByLabel("evidence").fill("integration test");
  await page.getByRole("button", { name: "Create task draft" }).click();
  await expect(page.getByText("Task created as a draft.")).toBeVisible();
  await expect(page.getByText("Task facts")).toBeVisible();
});
