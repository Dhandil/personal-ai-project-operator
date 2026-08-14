import { expect, test } from "@playwright/test";

const projectKey = "a".repeat(64);

test("approval history shows snapshot evidence and stale decisions", async ({
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
  await page.route(/\/api\/projects\/approvals\?.*$/, async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        value: {
          projectKey,
          approvals: [
            {
              approvalId: "APPROVAL-001",
              operation: "goal_acceptance",
              approval: {
                approvalType: "short_term_goal_acceptance_and_main_merge",
                subjectId: "GOAL-001",
                status: "completed",
                request: "Accept goal",
                decision: { outcome: "approved", note: "Accepted" },
              },
              subjectSnapshot: { revision: 2, hash: "abc" },
              currentSnapshot: { revision: 2, hash: "abc" },
              stale: false,
            },
          ],
        },
      }),
    }),
  );
  await page.goto("/projects/approvals");
  await expect(
    page.getByRole("heading", { name: "审批记录与目标验收" }),
  ).toBeVisible();
  await expect(
    page.getByText("APPROVAL-001 · short_term_goal_acceptance_and_main_merge"),
  ).toBeVisible();
  await expect(page.getByText("目标验收", { exact: true })).toBeVisible();
  await expect(page.getByText("快照 revision 2 · 有效")).toBeVisible();
});
