import { expect, test } from "@playwright/test";

test("system page shows safe Claude Runtime capability diagnostics", async ({
  page,
}) => {
  await page.route("**/api/projects", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        value: {
          projects: [],
          currentProjectKey: null,
          selectionState: "none",
        },
      }),
    }),
  );
  await page.route("**/api/runtime/claude/preflight", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        value: {
          runtime: "claude",
          executable: "claude",
          configuredModel: "deepseek-v4-pro",
          authenticationStatus: "authenticated",
          canExecute: true,
          timeoutMs: 120000,
          commands: {
            print: true,
            json: true,
            streamJson: true,
            resume: true,
            noSessionPersistence: true,
            permissionMode: true,
            toolBoundary: true,
            jsonSchema: true,
            projectPurge: true,
          },
          blockers: [],
          recommendations: [],
        },
      }),
    }),
  );

  await page.goto("/health");
  await expect(page.getByRole("heading", { name: "系统状态" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Claude Code 运行能力" }),
  ).toBeVisible();
  await expect(page.getByText("deepseek-v4-pro")).toBeVisible();
  await expect(page.getByText("可执行", { exact: true })).toBeVisible();
  await expect(
    page.getByText("诊断只显示能力摘要，不显示凭据、令牌或认证原文。"),
  ).toBeVisible();
});
