import { expect, test, type Page } from "@playwright/test";

const projectsPayload = {
  ok: true,
  value: {
    projects: [
      {
        projectKey: "a".repeat(64),
        rootPath: "D:\\projects\\demo",
        name: "演示项目",
        archived: false,
        selected: true,
        state: "available",
        status: "in_progress",
        statusRevision: 4,
        statusHash: "hash",
      },
    ],
    currentProjectKey: "a".repeat(64),
    selectionState: "selected",
  },
};

async function mockProjectContext(page: Page) {
  await page.route(/\/api\/projects$/, async (route) =>
    route.fulfill({ json: projectsPayload }),
  );
}

test("desktop shows the five primary modules and the active secondary tab", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockProjectContext(page);
  await page.goto("/projects/tasks");

  const primary = page.getByRole("navigation", { name: "一级导航" });
  const secondary = page.getByRole("navigation", { name: "项目二级导航" });

  await expect(primary).toBeVisible();
  await expect(page.getByRole("button", { name: "打开导航" })).toBeHidden();
  await expect(primary.getByRole("link")).toHaveCount(5);
  await expect(
    primary.getByRole("link", { name: "项目", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    secondary.getByRole("link", { name: "任务", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("region", { name: "当前项目上下文" }),
  ).toContainText("演示项目");

  await secondary.getByRole("link", { name: "角色", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/roles$/);
  await expect(
    page
      .getByRole("navigation", { name: "项目二级导航" })
      .getByRole("link", { name: "角色", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("desktop module switches preserve the required secondary pages", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockProjectContext(page);
  await page.goto("/projects/tasks");

  await page
    .getByRole("navigation", { name: "一级导航" })
    .getByRole("link", { name: "治理", exact: true })
    .click();
  await expect(page).toHaveURL(/\/projects\/approvals$/);
  await expect(
    page.getByRole("navigation", { name: "治理二级导航" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "治理二级导航" }).getByRole("link"),
  ).toHaveCount(3);

  await page
    .getByRole("navigation", { name: "一级导航" })
    .getByRole("link", { name: "执行", exact: true })
    .click();
  await expect(page).toHaveURL(/\/projects\/execution$/);
  await expect(
    page.getByRole("navigation", { name: "执行二级导航" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "执行二级导航" }).getByRole("link"),
  ).toHaveCount(2);
});

test("narrow viewport collapses primary navigation without secondary overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 480, height: 760 });
  await mockProjectContext(page);
  await page.goto("/projects/workflow");

  const primary = page.getByRole("navigation", { name: "一级导航" });
  const toggle = page.getByRole("button", { name: "打开导航" });
  const secondary = page.getByRole("navigation", { name: "项目二级导航" });

  await expect(toggle).toBeVisible();
  await expect(primary).toBeHidden();
  await expect(secondary.getByRole("link")).toHaveCount(5);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(480);

  await toggle.click();
  await expect(page.getByRole("button", { name: "收起导航" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(primary).toBeVisible();
  await expect(primary.getByRole("link")).toHaveCount(5);

  await page.getByRole("button", { name: "收起导航" }).click();
  await expect(primary).toBeHidden();
});
