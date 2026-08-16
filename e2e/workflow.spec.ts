import { expect, test } from "@playwright/test";

const projectKey = "a".repeat(64);

const workflow = {
  projectKey,
  projectRoot: "D:\\Projects\\demo",
  revision: 1,
  currentStage: "idea-clarification",
  stages: [
    {
      key: "idea-clarification",
      title: "想法澄清",
      order: 1,
      status: "draft",
      artifacts: [
        {
          relativePath: ".personal-workspace/stages/01-idea/01-idea.md",
          state: "available",
        },
      ],
    },
    {
      key: "problem-definition",
      title: "问题定义",
      order: 2,
      status: "draft",
      artifacts: [
        {
          relativePath:
            ".personal-workspace/stages/02-discovery/02-discovery.md",
          state: "missing",
        },
      ],
    },
    {
      key: "user-scenarios",
      title: "用户场景",
      order: 3,
      status: "draft",
      artifacts: [],
    },
    {
      key: "discovery-validation",
      title: "Discovery 验证",
      order: 4,
      status: "draft",
      artifacts: [],
    },
  ],
};

test("workflow page separates agent skip proposal from user decision", async ({
  page,
}) => {
  await page.route(/\/api\/projects$/, async (route) => {
    await route.fulfill({
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
    });
  });
  await page.route(/\/api\/projects\/workflow(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, value: workflow }),
    });
  });
  await page.route("**/api/projects/workflow/skip-proposal", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        value: {
          projectKey,
          proposal: {
            stageKey: "idea-clarification",
            proposedBy: "agent",
            rationale: "材料充分，但仍需用户确认风险。",
          },
          explanation: {
            material: ["项目想法"],
            missing: ["额外访谈"],
            risks: ["可能遗漏场景"],
          },
          workflow,
        },
      }),
    });
  });
  await page.route("**/api/projects/workflow/skip-decision", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        value: {
          projectKey,
          changed: true,
          decision: {
            decidedBy: "user",
            approved: true,
            reason: "用户确认材料充分。",
          },
          workflow: {
            ...workflow,
            revision: 2,
            currentStage: "problem-definition",
            stages: [
              {
                ...workflow.stages[0],
                status: "skipped",
                skipReason: "用户确认材料充分。",
              },
              workflow.stages[1],
            ],
          },
        },
      }),
    });
  });

  await page.goto("/projects/workflow");
  await expect(page.getByRole("heading", { name: "工作流阶段" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "工作流怎么推进" }),
  ).toBeVisible();
  await expect(page.getByText("用户无需手工上传")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "当前阶段：想法澄清" }),
  ).toBeVisible();
  await expect(page.getByText("首要操作")).toBeVisible();
  await expect(page.getByText("阶段状态").first()).toBeVisible();
  await expect(page.getByText("文件状态").first()).toBeVisible();
  await expect(
    page.getByText("无独立阶段文件；使用共用正式材料，无需上传。"),
  ).toHaveCount(2);
  await expect(page.getByRole("link", { name: "执行控制台" })).toBeVisible();
  await expect(
    page.getByText(".personal-workspace/stages/01-idea/01-idea.md").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "生成跳过建议" }).click();
  await page.getByLabel("已有材料").fill("项目想法");
  await page.getByLabel("缺失信息").fill("额外访谈");
  await page.getByLabel("潜在风险").fill("可能遗漏场景");
  await page.getByRole("button", { name: "生成建议" }).click();
  await expect(page.getByText("材料充分，但仍需用户确认风险。")).toBeVisible();
  await expect(page.getByText("尚未改变事实")).toBeVisible();
  await page.getByLabel("用户决定理由").fill("用户确认材料充分。");
  await page.getByRole("button", { name: "批准跳过并记录理由" }).click();
  await expect(page.getByText("已记录用户批准的跳过决定。")).toBeVisible();
  await expect(
    page
      .locator(".workflow-stage.current")
      .getByRole("heading", { name: "问题定义" }),
  ).toBeVisible();
});
