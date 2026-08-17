import { expect, test } from "@playwright/test";

const projectKey = "b".repeat(64);

const workflow = {
  projectKey,
  projectRoot: "D:\\Projects\\planning-console",
  revision: 1,
  currentStage: "idea-clarification",
  stages: [
    {
      key: "idea-clarification",
      title: "Idea",
      order: 1,
      status: "draft",
      artifacts: [],
    },
  ],
};

const stageState = {
  projectRoot: workflow.projectRoot,
  active: false,
  currentStage: "idea",
  currentRun: {
    stageRunId: "STAGE-RUN-001",
    stage: "idea",
    status: "awaiting_review",
    currentRole: "product-requirements",
    attempt: 1,
    executionId: null,
    sessionId: null,
    phase: "reviewer",
    candidateVersion: { revision: 1, hash: "sha256:candidate" },
    reviewVersion: { revision: 1, hash: "sha256:review" },
    reviewDecision: "accepted",
    artifactRefs: [
      {
        path: ".personal-workspace/stage-candidates/STAGE-RUN-001.md",
        revision: 1,
        contentHash: "sha256:candidate",
        kind: "candidate",
      },
    ],
    approvalRef: null,
    statusReason: "Awaiting user review.",
    revision: 2,
    hash: "sha256:run",
  },
  runs: [],
  recoveryRequired: false,
  approvalRequired: true,
};

const draft = {
  projectKey,
  projectRoot: workflow.projectRoot,
  status: "candidate",
  revision: 1,
  hash: "sha256:draft",
  draft: {
    schemaVersion: 1,
    kind: "planning_draft",
    specRevision: 2,
    specHash: "sha256:spec",
    goalDrafts: [
      {
        id: "GOAL-013",
        title: "Generated planning goal",
        boundary: ["bounded outcome"],
        risks: ["scope drift"],
        acceptanceCriteria: ["verification passes"],
      },
    ],
    roleDrafts: [
      {
        key: "executor",
        title: "Executor",
        responsibilities: ["implement"],
        mustRead: ["task card"],
        onDemandRead: ["decisions"],
        allowedActions: ["change allowed paths"],
        forbiddenActions: ["self-approve"],
        handoff: ["changed files"],
      },
    ],
    taskDrafts: [
      {
        id: "TASK-061",
        title: "First generated task",
        goalId: "GOAL-013",
        currentRole: "executor",
        dependencies: [],
        purpose: "Implement the outcome.",
        scope: ["implementation"],
        outputs: ["verified output"],
        acceptanceCriteria: ["tests pass"],
        requiredFiles: [".personal-workspace/stages/03-spec/03-spec.md"],
        onDemandFiles: [".personal-workspace/project.md"],
        allowedPaths: ["apps"],
        forbiddenPaths: [".git"],
        verificationCommands: ["npm run verify"],
      },
    ],
    dependencyGraph: { "TASK-061": [] },
    handoff: "Review before formal facts are written.",
  },
};

test("planning console separates stage approval from planning draft approval", async ({
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
  await page.route(/\/api\/projects\/stages(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, value: stageState }),
    });
  });
  await page.route(
    /\/api\/projects\/planning-draft(?:\?.*)?$/,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, value: draft }),
      });
    },
  );
  await page.route("**/api/projects/planning-draft/edit", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        value: {
          ...draft,
          revision: 2,
          hash: "sha256:edited",
          draft: {
            ...draft.draft,
            goalDrafts: [
              { ...draft.draft.goalDrafts[0], title: "Edited goal" },
            ],
          },
        },
      }),
    });
  });
  await page.route("**/api/projects/planning-draft/approve", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        value: {
          projectKey,
          goalIds: ["GOAL-013"],
          taskIds: ["TASK-061"],
          readyTaskId: "TASK-061",
          writtenFiles: [".personal-workspace/goals/GOAL-013.md"],
          recoveryPlan: [],
        },
      }),
    });
  });

  await page.goto("/projects/workflow");
  await expect(
    page.getByRole("heading", { name: "项目前期规划控制台" }),
  ).toBeVisible();
  await expect(page.getByText("阶段审核门")).toBeVisible();

  await page.getByRole("button", { name: "规划草案" }).click();
  await expect(page.getByText("候选版本")).toBeVisible();
  await expect(page.getByText("Executor", { exact: true })).toBeVisible();
  await page.getByLabel("目标标题（用户可编辑）").fill("Edited goal");
  await page.getByRole("button", { name: "保存草案编辑" }).click();
  await expect(page.getByText("用户编辑已保存为新的候选版本。")).toBeVisible();
  await page
    .locator(".draft-decision-reason textarea")
    .fill("User approved the plan.");
  await page.getByRole("button", { name: "批准并写入正式事实" }).click();
  await expect(page.getByText(/规划草案已批准/)).toBeVisible();
  await expect(page.getByText("GOAL-013")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "打开执行控制台" }),
  ).toHaveAttribute("href", "/projects/execution");
});
