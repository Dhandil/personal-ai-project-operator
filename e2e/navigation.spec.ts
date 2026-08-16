import { expect, test } from "@playwright/test";

const groups = ["工作区", "当前项目", "运行与治理"];

const destinations = [
  { name: "项目首页", href: "/" },
  { name: "新建项目", href: "/projects/new" },
  { name: "服务状态", href: "/health" },
  { name: "项目总览", href: "/projects" },
  { name: "工作流", href: "/projects/workflow" },
  { name: "目标与任务", href: "/projects/goals" },
  { name: "任务卡", href: "/projects/tasks" },
  { name: "角色", href: "/projects/roles" },
  { name: "执行", href: "/projects/execution" },
  { name: "审批", href: "/projects/approvals" },
  { name: "问题与决策", href: "/projects/issues" },
  { name: "历史", href: "/projects/history" },
  { name: "报告", href: "/projects/reports" },
] as const;

test("desktop sidebar groups every existing page and marks the current route", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/projects/tasks");

  const navigation = page.getByRole("navigation", { name: "主导航" });
  await expect(navigation).toBeVisible();
  await expect(page.getByRole("button", { name: "打开导航" })).toBeHidden();

  for (const group of groups) {
    await expect(
      navigation.getByRole("heading", { name: group }),
    ).toBeVisible();
  }

  for (const destination of destinations) {
    await expect(
      navigation.getByRole("link", { name: destination.name }),
    ).toHaveAttribute("href", destination.href);
  }

  await expect(
    navigation.getByRole("link", { name: "任务卡" }),
  ).toHaveAttribute("aria-current", "page");

  await navigation.getByRole("link", { name: "角色", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/roles$/);
  await expect(
    page
      .getByRole("navigation", { name: "主导航" })
      .getByRole("link", { name: "角色", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("narrow viewport replaces the sidebar with an accessible menu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 480, height: 760 });
  await page.goto("/");

  const navigation = page.getByRole("navigation", { name: "主导航" });
  const toggle = page.getByRole("button", { name: "打开导航" });

  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(navigation).toBeHidden();

  await toggle.click();
  await expect(page.getByRole("button", { name: "收起导航" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(navigation).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "项目首页" }),
  ).toHaveAttribute("aria-current", "page");

  await page.getByRole("button", { name: "收起导航" }).click();
  await expect(navigation).toBeHidden();
});
