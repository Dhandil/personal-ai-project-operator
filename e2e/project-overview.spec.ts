import { expect, test } from "@playwright/test";

const projectKey = "a".repeat(64);

const projectList = {
  projects: [
    {
      projectKey,
      rootPath: "D:\\Projects\\demo",
      name: "Demo project",
      archived: false,
      selected: true,
      state: "available",
      status: "in_progress",
      statusRevision: 3,
      statusHash: "b".repeat(64),
    },
  ],
  currentProjectKey: projectKey,
  selectionState: "selected",
};

const startup = {
  started: true,
  autoStarted: false,
  needsRecovery: false,
  needsUserAction: true,
  action: "continue_with_user_approval",
  project: {
    projectKey,
    rootPath: "D:\\Projects\\demo",
    name: "Demo project",
    idea: "A governed project",
  },
  currentStatus: { status: "in_progress", revision: 3, hash: "b".repeat(64) },
  summary: {
    goal: "A governed project",
    approvedShortTermGoal: "Ship the first slice",
    completedResults: "Project initialized",
    currentTask: "TASK-021",
    blockersRisksDecisions: "No blocker",
    lastStep: "Created the overview",
    recommendedNext: "Review the current task",
    userActionNeeded: "Approve the next step",
  },
};

test("project overview waits for an explicit daily startup action", async ({
  page,
}) => {
  let startupRequests = 0;
  await page.route("**/api/projects", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, value: projectList }),
      });
    }
  });
  await page.route("**/api/projects/startup", async (route) => {
    startupRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, value: startup }),
    });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "项目总览" })).toBeVisible();
  await expect(
    page.locator(".project-list").getByText("Demo project"),
  ).toBeVisible();
  await expect(page.getByText("推荐下一步")).toBeHidden();
  expect(startupRequests).toBe(0);

  await page.getByRole("button", { name: "启动今日工作" }).click();
  await expect(
    page.getByRole("heading", { name: "今日启动摘要" }),
  ).toBeVisible();
  await expect(page.getByText("Review the current task")).toBeVisible();
  await expect(
    page.getByText("仅供参考，不会自动批准、执行或改变项目状态"),
  ).toBeVisible();
  expect(startupRequests).toBe(1);
});
