import { expect, test, type Page } from "@playwright/test";

const projectKey = "a".repeat(64);

const routes = [
  "/",
  "/projects/new",
  "/projects",
  "/projects/workflow",
  "/projects/goals",
  "/projects/tasks",
  "/projects/roles",
  "/projects/execution",
  "/projects/reports",
  "/projects/approvals",
  "/projects/issues",
  "/projects/history",
  "/health",
] as const;

async function mockProjectContext(page: Page): Promise<void> {
  await page.route(/\/api\/projects$/, async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        value: {
          projects: [
            {
              projectKey,
              rootPath: "D:\\Projects\\viewport-demo",
              name: "Viewport demo",
              archived: false,
              selected: true,
              state: "available",
              status: "in_progress",
              statusRevision: 1,
              statusHash: "hash",
            },
          ],
          currentProjectKey: projectKey,
          selectionState: "selected",
        },
      }),
    }),
  );
}

test("desktop pages stay inside the viewport shell", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockProjectContext(page);

  for (const route of routes) {
    await page.goto(route);
    const heading = page.locator("main h1").first();
    if ((await heading.count()) === 0) {
      throw new Error(`Expected a page heading for ${route}`);
    }
    await expect(heading).toBeVisible();
    const metrics = await page.evaluate(() => ({
      documentHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      mainScrollHeight: document.querySelector("main")?.scrollHeight ?? 0,
    }));
    expect(metrics.documentHeight).toBeLessThanOrEqual(metrics.viewportHeight);
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth);
    expect(metrics.mainScrollHeight).toBeGreaterThan(0);
  }
});

test("narrow pages preserve readable flow and never overflow horizontally", async ({
  page,
}) => {
  await page.setViewportSize({ width: 480, height: 760 });
  await mockProjectContext(page);

  for (const route of [
    "/",
    "/projects/new",
    "/projects/workflow",
    "/projects/tasks",
  ]) {
    await page.goto(route);
    await expect(page.locator("main h1").first()).toBeVisible();
    const metrics = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      bodyOverflow: getComputedStyle(document.body).overflowX,
    }));
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth);
    expect(metrics.bodyOverflow).not.toBe("scroll");
  }
});

test("desktop keyboard focus reaches the page tabs after the primary navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockProjectContext(page);
  await page.goto("/projects/workflow");

  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => ({
    tagName: document.activeElement?.tagName,
    href: (document.activeElement as HTMLAnchorElement | null)?.href ?? "",
  }));
  expect(focused.tagName).toBe("A");
  expect(focused.href).toMatch(/\/projects|\/projects\/new|\/$/);
});
