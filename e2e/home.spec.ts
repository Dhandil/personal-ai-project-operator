import { expect, test } from "@playwright/test";

test("home page shows the product and backend status", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("link", { name: "个人 AI 项目运营工具" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "后端连接状态" }).getByRole("status"),
  ).toContainText("后端服务已连接");
});
