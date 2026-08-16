import { expect, test } from "@playwright/test";

const projectKey = "a".repeat(64);

function response(value: unknown): {
  status: number;
  contentType: string;
  body: string;
} {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, value }),
  };
}

test("desktop governance pages keep long records in local scroll regions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route(/\/api\/projects$/, async (route) =>
    route.fulfill(
      response({
        projects: [],
        currentProjectKey: projectKey,
        selectionState: "selected",
      }),
    ),
  );
  await page.route(/\/api\/projects\/approvals\?.*$/, async (route) =>
    route.fulfill(
      response({
        projectKey,
        approvals: Array.from({ length: 40 }, (_, index) => ({
          approvalId: `APPROVAL-${index + 1}`,
          approval: {
            approvalType: "goal_start",
            subjectId: "GOAL-010",
            status: "approved",
            request: "Review",
            decision: { outcome: "approved", note: "Confirmed" },
          },
          operation: "goal_acceptance",
          subjectSnapshot: { revision: 1, hash: "hash" },
          currentSnapshot: { revision: 1, hash: "hash" },
          stale: false,
        })),
      }),
    ),
  );
  await page.route(/\/api\/projects\/history\?.*$/, async (route) =>
    route.fulfill(
      response({
        projectKey,
        entries: Array.from({ length: 40 }, (_, index) => ({
          kind: "audit_event",
          id: `EXEC-${index + 1}`,
          relativePath: ".personal-workspace/audit/events.jsonl",
          revision: null,
          hash: null,
          occurredAt: "2026-08-16T08:00:00Z",
          summary: "Audit-backed event",
        })),
      }),
    ),
  );

  await page.goto("/projects/approvals");
  await expect(
    page.getByRole("heading", { name: "审批记录与目标验收" }),
  ).toBeVisible();
  await expect(page.locator(".stack-list")).toHaveCSS("overflow-y", "auto");
  await expect(page.locator(".stack-list")).toHaveCSS("max-height", /px/);

  await page.goto("/projects/history");
  await expect(
    page.getByRole("heading", { name: "重启恢复与历史查看" }),
  ).toBeVisible();
  await expect(page.locator(".stack-list")).toHaveCSS("overflow-y", "auto");
  const heading = page.locator(".compact-records-page > h1");
  await expect(heading).toBeVisible();
  const headingInViewport = await heading.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= window.innerHeight;
  });
  expect(headingInViewport).toBe(true);
});
