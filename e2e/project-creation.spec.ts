import { expect, test } from "@playwright/test";

const preview = {
  projectRoot: "D:\\Projects\\demo",
  projectName: "demo",
  idea: "A governed project",
  plannedFiles: [
    {
      relativePath: ".personal-workspace/project.md",
      action: "create",
      reason: "governance_template",
    },
    {
      relativePath: ".personal-workspace/workflow.md",
      action: "create",
      reason: "governance_template",
    },
  ],
  plannedDirectories: [],
  conflicts: [],
  defaultWorkflow: [{ key: "idea-clarification" }],
  defaultRoles: [{ key: "project-lead" }],
  defaultSettings: [{ key: "git.default_branch", value: "main" }],
  git: {
    detected: { state: "no_repository" },
    planned: {
      action: "initialize_local_repository",
      approvalRequired: true,
      commands: ["git init --initial-branch=main"],
      remoteOperations: [],
    },
    writesPerformed: false,
  },
  directoryFingerprint: "fixture-fingerprint",
  writesPerformed: false,
  registryChanged: false,
};

test("project creation keeps preview and approved creation as separate actions", async ({
  page,
}) => {
  await page.route("**/api/projects/select-directory", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        value: { projectRoot: "D:\\Projects\\selected" },
      }),
    });
  });
  await page.route("**/api/projects/preview", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, value: preview }),
    });
  });
  await page.route("**/api/projects/initialize", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        value: {
          projectRoot: preview.projectRoot,
          projectKey: "a".repeat(64),
          filesCreated: [".personal-workspace/project.md"],
          approvalId: "APPROVAL-001",
          auditEventId: "EXEC-001",
          git: { kind: "initialized" },
        },
      }),
    });
  });

  await page.goto("/projects/new");
  await expect(
    page.getByRole("heading", { name: "创建一个受治理的项目" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "选择本机目录" }).click();
  await expect(page.getByLabel(/项目目录/)).toHaveValue(
    "D:\\Projects\\selected",
  );
  await page.getByLabel(/项目想法/).fill("A governed project");
  await page.getByRole("button", { name: /生成初始化预览/ }).click();

  await expect(page.getByRole("heading", { name: "初始化预览" })).toBeVisible();
  await expect(page.getByText("只读预览")).toBeVisible();
  await expect(page.getByText(".personal-workspace/project.md")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "批准并创建项目" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "批准并创建项目" }).click();
  await expect(page.getByRole("heading", { name: "项目已创建" })).toBeVisible();
  await expect(page.getByText("EXEC-001")).toBeVisible();
});
