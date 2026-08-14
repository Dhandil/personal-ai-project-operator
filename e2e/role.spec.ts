import { expect, test } from "@playwright/test";

const projectKey = "a".repeat(64);
const role = {
  key: "reviewer",
  title: "Reviewer",
  responsibilities: ["inspect evidence"],
  mustRead: ["task card"],
  onDemandRead: ["decision records"],
  allowedActions: ["read repository", "write review report"],
  forbiddenActions: ["modify implementation"],
  handoff: ["findings"],
};

test("role page shows editable templates and reviewer file boundary", async ({
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
  await page.route(/\/api\/projects\/roles\?.*$/, async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        value: {
          projectKey,
          projectRoot: "D:\\project",
          roles: [
            {
              role,
              source: "default",
              relativePath: ".personal-workspace/roles/reviewer.md",
              fileState: "missing",
              context: {
                mustRead: [
                  {
                    name: "task card",
                    required: true,
                    paths: [".personal-workspace/tasks"],
                    state: "available",
                  },
                ],
                onDemandRead: [],
              },
              canModifyProjectFiles: false,
              revision: null,
              hash: null,
            },
          ],
        },
      }),
    }),
  );
  await page.goto("/projects/roles");
  await expect(
    page.getByRole("heading", { name: "Roles and context" }),
  ).toBeVisible();
  await expect(
    page.getByText("Reviewer: formal files read-only"),
  ).toBeVisible();
  await expect(
    page.locator(".context-item").getByText("task card", { exact: true }),
  ).toBeVisible();
});
