import { expect, test, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const projectKey = "a".repeat(64);

function json(
  value: unknown,
  status = 200,
): { status: number; contentType: string; body: string } {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(value),
  };
}

function projectList(
  projectRoot: string,
  state: "available" | "needs_recovery" = "available",
) {
  return {
    ok: true,
    value: {
      projects: [
        {
          projectKey,
          rootPath: projectRoot,
          name: "Temporary V0 project",
          archived: false,
          selected: true,
          state,
          status: state === "available" ? "draft" : "unavailable",
          statusRevision: state === "available" ? 1 : null,
          statusHash: state === "available" ? "status-hash" : null,
          ...(state === "needs_recovery"
            ? {
                factsError: {
                  code: "status_not_found",
                  message: "The generated status snapshot does not exist.",
                },
              }
            : {}),
        },
      ],
      currentProjectKey: projectKey,
      selectionState: "selected",
    },
  };
}

async function routeStableV0Apis(
  page: Page,
  projectRoot: string,
): Promise<void> {
  await page.route(/\/api\/projects$/, async (route) =>
    route.fulfill(json(projectList(projectRoot))),
  );
  await page.route("**/api/projects/startup", async (route) =>
    route.fulfill(
      json({
        ok: true,
        value: {
          started: true,
          autoStarted: false,
          needsRecovery: false,
          needsUserAction: true,
          action: "continue_with_user_approval",
          project: {
            projectKey,
            rootPath: projectRoot,
            name: "Temporary V0 project",
            idea: "A temporary governed project",
          },
          currentStatus: { status: "draft", revision: 1, hash: "status-hash" },
          summary: {
            goal: "A temporary governed project",
            approvedShortTermGoal: "GOAL-001",
            completedResults: "Project initialized",
            currentTask: "TASK-001",
            blockersRisksDecisions: "None",
            lastStep: "Created facts",
            recommendedNext: "Review task",
            userActionNeeded: "Approve next step",
          },
        },
      }),
    ),
  );
  await page.route(/\/api\/projects\/workflow(?:\?.*)?$/, async (route) =>
    route.fulfill(
      json({
        ok: true,
        value: {
          projectKey,
          projectRoot,
          revision: 1,
          currentStage: "idea-clarification",
          stages: [
            {
              key: "idea-clarification",
              title: "Idea clarification",
              order: 1,
              status: "draft",
              artifacts: [
                {
                  relativePath: ".personal-workspace/stages/01-idea/01-idea.md",
                  state: "available",
                },
              ],
            },
          ],
        },
      }),
    ),
  );
  await page.route(/\/api\/projects\/goals\?.*$/, async (route) =>
    route.fulfill(
      json({ ok: true, value: { projectKey, projectRoot, goals: [] } }),
    ),
  );
  await page.route(/\/api\/projects\/roles\?.*$/, async (route) =>
    route.fulfill(
      json({
        ok: true,
        value: {
          projectKey,
          projectRoot,
          roles: [
            {
              role: {
                key: "reviewer",
                title: "Reviewer",
                responsibilities: ["inspect evidence"],
                mustRead: ["task card"],
                onDemandRead: [],
                allowedActions: ["read repository", "write review report"],
                forbiddenActions: ["modify implementation"],
                handoff: ["findings"],
              },
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
    ),
  );
  await page.route(/\/api\/projects\/tasks\?.*$/, async (route) =>
    route.fulfill(
      json({ ok: true, value: { projectKey, projectRoot, tasks: [] } }),
    ),
  );
  await page.route(/\/api\/projects\/issues\?.*$/, async (route) =>
    route.fulfill(
      json({
        ok: true,
        value: { projectKey, projectRoot, issues: [], decisions: [] },
      }),
    ),
  );
  await page.route(/\/api\/projects\/approvals\?.*$/, async (route) =>
    route.fulfill(json({ ok: true, value: { projectKey, approvals: [] } })),
  );
  await page.route(/\/api\/projects\/history\?.*$/, async (route) =>
    route.fulfill(json({ ok: true, value: { projectKey, entries: [] } })),
  );
  await page.route(/\/api\/projects\/reports\?.*$/, async (route) =>
    route.fulfill(json({ ok: true, value: { projectKey, reports: [] } })),
  );
  await page.route(/\/api\/projects\/settings\?.*$/, async (route) =>
    route.fulfill(
      json({
        ok: true,
        value: { projectKey, intervalMinutes: 10, source: "default" },
      }),
    ),
  );
  await page.route("**/api/projects/events**", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: ": connected\n\n",
    }),
  );
}

test("V0 browser flow covers a temporary project across all governance surfaces", async ({
  page,
}) => {
  const projectRoot = await mkdtemp(join(tmpdir(), "personal-ai-v0-browser-"));
  try {
    await routeStableV0Apis(page, projectRoot);
    await page.route("**/api/projects/preview", async (route) =>
      route.fulfill(
        json({
          ok: true,
          value: {
            projectRoot,
            projectName: "Temporary V0 project",
            idea: "A temporary governed project",
            directoryFingerprint: "fixture",
            plannedFiles: [
              {
                relativePath: ".personal-workspace/project.md",
                action: "create",
                reason: "governance_template",
              },
            ],
            plannedDirectories: [],
            conflicts: [],
            defaultWorkflow: [{ key: "idea-clarification" }],
            defaultRoles: [{ key: "reviewer" }],
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
            writesPerformed: false,
            registryChanged: false,
          },
        }),
      ),
    );
    await page.route("**/api/projects/initialize", async (route) =>
      route.fulfill(
        json({
          ok: true,
          value: {
            projectRoot,
            projectKey,
            filesCreated: [".personal-workspace/project.md"],
            approvalId: "APPROVAL-001",
            auditEventId: "EXEC-001",
            git: { kind: "initialized" },
          },
        }),
      ),
    );

    await page.goto("/projects/new");
    await page.locator("#project-root").fill(projectRoot);
    await page.locator("#project-idea").fill("A temporary governed project");
    await page.getByRole("button", { name: /生成.*预览/ }).click();
    await expect(
      page.getByRole("region", { name: "初始化预览" }).getByText(projectRoot),
    ).toBeVisible();
    await page.getByRole("button", { name: /批准并创建项目/ }).click();
    await expect(page.getByText("EXEC-001")).toBeVisible();

    await page.goto("/");
    await expect(page.locator(".project-list-panel")).toBeVisible();
    await page.locator(".startup-button").click();
    await expect(page.locator(".startup-summary")).toBeVisible();

    for (const route of [
      "/projects/workflow",
      "/projects/goals",
      "/projects/roles",
      "/projects/tasks",
      "/projects/issues",
      "/projects/approvals",
      "/projects/history",
      "/projects/reports",
    ]) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
    }
    await page.goto("/projects/roles");
    await expect(page.locator(".role-page")).toBeVisible();
    await page.goto("/projects/tasks");
    await expect(
      page.getByRole("heading", { name: "Tasks and dependencies" }),
    ).toBeVisible();
    await page.goto("/projects/issues");
    await expect(
      page.getByRole("heading", { name: "Issue coordination" }),
    ).toBeVisible();
    await page.goto("/projects/approvals");
    await expect(
      page.getByRole("heading", { name: "审批记录与目标验收" }),
    ).toBeVisible();
    await page.goto("/projects/history");
    await expect(
      page.getByRole("heading", { name: "重启恢复与历史查看" }),
    ).toBeVisible();
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("V0 blocks approval on conflicts and surfaces an unapproved execution failure", async ({
  page,
}) => {
  const projectRoot = await mkdtemp(join(tmpdir(), "personal-ai-v0-conflict-"));
  try {
    await page.route("**/api/projects/preview", async (route) =>
      route.fulfill(
        json({
          ok: true,
          value: {
            projectRoot,
            projectName: "Conflict project",
            idea: "Conflict fixture",
            directoryFingerprint: "fixture",
            plannedFiles: [
              {
                relativePath: ".personal-workspace/project.md",
                action: "conflict",
                reason: "existing_file",
              },
            ],
            plannedDirectories: [],
            conflicts: [
              {
                relativePath: ".personal-workspace/project.md",
                action: "conflict",
                reason: "existing_file",
              },
            ],
            defaultWorkflow: [],
            defaultRoles: [],
            defaultSettings: [],
            git: {
              detected: { state: "existing_repository" },
              planned: {
                action: "preserve_existing_repository",
                approvalRequired: true,
                commands: [],
                remoteOperations: [],
              },
              writesPerformed: false,
            },
            writesPerformed: false,
            registryChanged: false,
          },
        }),
      ),
    );
    await page.route("**/api/projects/initialize", async (route) =>
      route.fulfill(
        json(
          {
            ok: false,
            error: {
              code: "conflicts_present",
              message: "Conflicts must be resolved before approval.",
              details: [".personal-workspace/project.md"],
            },
          },
          400,
        ),
      ),
    );
    await page.goto("/projects/new");
    await page.locator("#project-root").fill(projectRoot);
    await page.locator("#project-idea").fill("Conflict fixture");
    await page.getByRole("button", { name: /生成.*预览/ }).click();
    const approve = page.getByRole("button", { name: /批准并创建项目/ });
    await expect(approve).toBeDisabled();
    await expect(page.getByText(/冲突/)).toBeVisible();

    await page.unroute("**/api/projects/preview");
    await page.route("**/api/projects/preview", async (route) =>
      route.fulfill(
        json({
          ok: true,
          value: {
            projectRoot,
            projectName: "Unapproved project",
            idea: "Unapproved fixture",
            directoryFingerprint: "fixture",
            plannedFiles: [],
            plannedDirectories: [],
            conflicts: [],
            defaultWorkflow: [],
            defaultRoles: [],
            defaultSettings: [],
            git: {
              detected: { state: "no_repository" },
              planned: {
                action: "initialize_local_repository",
                approvalRequired: true,
                commands: [],
                remoteOperations: [],
              },
              writesPerformed: false,
            },
            writesPerformed: false,
            registryChanged: false,
          },
        }),
      ),
    );
    await page.getByRole("button", { name: /返回修改/ }).click();
    await page.locator("#project-idea").fill("Unapproved fixture");
    await page.getByRole("button", { name: /生成.*预览/ }).click();
    await page.getByRole("button", { name: /批准并创建项目/ }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Conflicts must be resolved before approval.",
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("V0 reports recovery-required startup and illegal workflow state without writing", async ({
  page,
}) => {
  const projectRoot = await mkdtemp(join(tmpdir(), "personal-ai-v0-recovery-"));
  try {
    await page.route(/\/api\/projects$/, async (route) =>
      route.fulfill(json(projectList(projectRoot, "needs_recovery"))),
    );
    await page.route("**/api/projects/startup", async (route) =>
      route.fulfill(
        json({
          ok: true,
          value: {
            started: false,
            autoStarted: false,
            needsRecovery: true,
            needsUserAction: true,
            action: "review_project_facts",
            project: {
              projectKey,
              rootPath: projectRoot,
              name: "Recovery project",
              idea: "",
            },
            currentStatus: null,
            summary: null,
          },
        }),
      ),
    );
    await page.route(/\/api\/projects\/workflow(?:\?.*)?$/, async (route) =>
      route.fulfill(
        json(
          {
            ok: false,
            error: {
              code: "invalid_facts",
              message: "Workflow fact is invalid.",
              details: ["workflow.md"],
            },
          },
          400,
        ),
      ),
    );
    await page.goto("/");
    await expect(
      page.locator(".project-card .project-state.needs_recovery"),
    ).toBeVisible();
    await page.locator(".startup-button").click();
    await expect(page.locator(".overview-alert.recovery")).toBeVisible();
    await page.goto("/projects/workflow");
    await expect(page.getByRole("alert")).toContainText(
      "Workflow fact is invalid.",
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
