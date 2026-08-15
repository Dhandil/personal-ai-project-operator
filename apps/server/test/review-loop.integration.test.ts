import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type {
  AgentRuntime,
  ExecutionId,
  TaskId,
} from "@personal-ai-operator/contracts";
import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";

import { ApprovalService } from "../src/infrastructure/approvals/approval-service.js";
import {
  ExecutionCoordinatorService,
  ExecutionLock,
} from "../src/infrastructure/execution/execution-coordinator.js";
import { FakeAgentAdapter } from "../src/infrastructure/agent-runtime/fake-agent-adapter.js";
import { GitChangeBoundaryService } from "../src/infrastructure/git/git-change-boundary.js";
import { GitProcess } from "../src/infrastructure/git/git-process.js";
import { GoalService } from "../src/infrastructure/goals/goal-service.js";
import { IssueService } from "../src/infrastructure/issues/issue-service.js";
import { ProjectRegistryRepository } from "../src/infrastructure/registry/project-registry-repository.js";
import { ReviewLoopService } from "../src/infrastructure/reviews/review-loop-service.js";
import { ReviewService } from "../src/infrastructure/reviews/review-service.js";
import { RoleService } from "../src/infrastructure/roles/role-service.js";
import { TaskPackageService } from "../src/infrastructure/execution/task-package-service.js";
import type { TaskResultValidationReport } from "../src/infrastructure/execution/task-result-validation.js";
import { TaskService } from "../src/infrastructure/tasks/task-service.js";

const timestamp = parseUtcIsoTimestamp("2026-08-15T12:00:00Z");

async function runGit(root: string, args: readonly string[]): Promise<void> {
  const result = await new GitProcess().run(args, root);
  assert.equal(result.exitCode, 0, result.stderr);
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-review-loop-"));
  const projectRoot = join(root, "project");
  await mkdir(join(projectRoot, ".personal-workspace", "goals"), {
    recursive: true,
  });
  await mkdir(join(projectRoot, ".personal-workspace", "tasks"), {
    recursive: true,
  });
  await writeFile(
    join(projectRoot, ".personal-workspace", "goals", "GOAL-009.md"),
    [
      "---",
      "schema_version: 1",
      "document_type: goal",
      "revision: 1",
      "created_at: 2026-08-15T12:00:00Z",
      "updated_at: 2026-08-15T12:00:00Z",
      "id: GOAL-009",
      "title: Review loop goal",
      "boundary: [review]",
      "risks: []",
      "acceptance_criteria: [review loop is governed]",
      "proposed_by: project-lead-agent",
      "status: ready",
      "approval:",
      "  decidedBy: user",
      "  approved: true",
      "  decidedAt: 2026-08-15T12:00:00Z",
      "---",
      "",
    ].join("\n"),
  );
  await writeFile(join(projectRoot, "result.txt"), "baseline\n", "utf8");
  await runGit(projectRoot, ["init", "--initial-branch=main"]);
  await runGit(projectRoot, ["config", "user.name", "Test User"]);
  await runGit(projectRoot, ["config", "user.email", "test@example.com"]);
  await runGit(projectRoot, ["add", "--", "."]);
  await runGit(projectRoot, ["commit", "-m", "initial"]);

  const databasePath = join(root, "app.db");
  const registryDirectory = join(root, "registry");
  const registry = new ProjectRegistryRepository({
    databasePath,
    registryDirectory,
  });
  const registered = await registry.register({
    rootPath: projectRoot,
    name: "Review loop fixture",
    registeredAt: timestamp,
  });
  registry.close();
  assert.equal(registered.ok, true);
  if (!registered.ok) throw new Error(registered.error.message);
  return {
    root,
    projectRoot,
    projectKey: registered.value.projectKey,
    databasePath,
    registryDirectory,
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

function services(value: Fixture) {
  const registryFactory = () =>
    new ProjectRegistryRepository({
      databasePath: value.databasePath,
      registryDirectory: value.registryDirectory,
    });
  const taskService = new TaskService({
    now: () => timestamp,
    registryFactory,
  });
  const goalService = new GoalService({
    now: () => timestamp,
    registryFactory,
  });
  const issueService = new IssueService({
    now: () => timestamp,
    registryFactory,
  });
  const roleService = new RoleService({ registryFactory });
  const taskPackageService = new TaskPackageService({
    taskService,
    goalService,
    roleService,
  });
  return {
    registryFactory,
    taskService,
    goalService,
    issueService,
    taskPackageService,
  };
}

async function createTask(value: Fixture, title: string): Promise<TaskId> {
  const created = await services(value).taskService.create({
    projectKey: value.projectKey,
    goalId: "GOAL-009",
    title,
    currentRole: "executor",
    dependencies: [],
    purpose: "Exercise a governed review loop.",
    scope: ["result.txt"],
    outputs: ["review report"],
    acceptanceCriteria: ["review loop is complete"],
    requiredFiles: ["result.txt"],
    onDemandFiles: ["README.md"],
    associatedDecisions: [],
    allowedPaths: ["result.txt"],
    forbiddenPaths: [".git", ".personal-workspace/audit"],
    run: {
      mode: "local",
      gitBranch: "goal/GOAL-009",
      worktree: ".",
      verificationCommands: ["npm run test:integration -- review-loop"],
    },
    evidence: ["execution validation"],
    completion: {
      output: "Execution output",
      tests: ["review-loop.integration.test.ts"],
      outstandingIssues: [],
      handoff: "Continue the governed loop.",
    },
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error(created.error.message);
  return created.value.task.id;
}

async function moveToInReview(value: Fixture, taskId: TaskId): Promise<void> {
  const taskService = services(value).taskService;
  const ready = await taskService.ready({
    projectKey: value.projectKey,
    taskId,
  });
  assert.equal(ready.ok, true);
  if (!ready.ok) throw new Error(ready.error.message);
  const started = await taskService.transition({
    projectKey: value.projectKey,
    taskId,
    toStatus: "in_progress",
    reason: "Test execution started.",
    revision: ready.value.revision,
    hash: ready.value.hash,
  });
  assert.equal(started.ok, true);
  if (!started.ok) throw new Error(started.error.message);
  const reviewed = await taskService.transition({
    projectKey: value.projectKey,
    taskId,
    toStatus: "in_review",
    reason: "Test execution produced a reviewable result.",
    revision: started.value.revision,
    hash: started.value.hash,
  });
  assert.equal(reviewed.ok, true);
  if (!reviewed.ok) throw new Error(reviewed.error.message);
}

function validation(
  taskId: TaskId,
  executionId: ExecutionId,
): TaskResultValidationReport {
  return {
    passed: true,
    executionId,
    taskId,
    claimedStatus: "completed",
    artifacts: [{ path: "result.txt", exists: true, kind: "file" }],
    verification: [
      {
        command: "npm run test:integration -- review-loop",
        exitCode: 0,
        stdout: "passed",
        stderr: "",
        error: null,
      },
    ],
    boundary: {
      passed: true,
      changes: [
        {
          path: "result.txt",
          previousPath: null,
          kind: "modified",
          indexStatus: " ",
          worktreeStatus: "M",
          contentHash: "hash",
        },
      ],
      violations: [],
      beforeHead: "head",
      afterHead: "head",
      beforeBranch: "goal/GOAL-009",
      afterBranch: "goal/GOAL-009",
    },
    evidence: {
      required: ["execution validation"],
      verified: true,
      details: [],
    },
    reasons: [],
  };
}

function reviewerOutput(
  taskId: TaskId,
  decision: "accepted" | "changes_requested" | "blocked",
) {
  return {
    schemaVersion: 1,
    kind: "reviewer_result",
    taskId,
    decision,
    findings: JSON.stringify([
      { severity: "low", path: "result.txt", message: "Review finding." },
    ]),
    verificationEvidence: JSON.stringify(["The review evidence was checked."]),
    requiredChanges: JSON.stringify(
      decision === "accepted" ? [] : ["Address the reported finding."],
    ),
    handoff: "Continue the governed review loop.",
  } as const;
}

function reviewService(value: Fixture, runtime: AgentRuntime): ReviewService {
  const configured = services(value);
  return new ReviewService({
    runtime,
    taskPackageService: configured.taskPackageService,
    boundary: new GitChangeBoundaryService(),
    registryFactory: configured.registryFactory,
    now: () => timestamp,
  });
}

function loopService(
  value: Fixture,
  review: ReviewService,
  runtime: AgentRuntime,
): ReviewLoopService {
  const configured = services(value);
  const coordinator = new ExecutionCoordinatorService({
    runtime,
    taskService: configured.taskService,
    goalService: configured.goalService,
    issueService: configured.issueService,
    lock: new ExecutionLock(),
  });
  return new ReviewLoopService({
    reviewService: review,
    taskService: configured.taskService,
    goalService: configured.goalService,
    issueService: configured.issueService,
    approvalService: new ApprovalService({
      registryFactory: configured.registryFactory,
      now: () => timestamp,
    }),
    executionCoordinator: coordinator,
  });
}

test("returns changes_requested to the executor and re-reviews with the same reviewer instance", async () => {
  const value = await fixture();
  try {
    const taskId = await createTask(value, "Review loop task");
    await moveToInReview(value, taskId);
    const reviewerRuntime = new FakeAgentAdapter({
      scenarios: [
        {
          outcome: "success",
          output: reviewerOutput(taskId, "changes_requested"),
        },
        { outcome: "success", output: reviewerOutput(taskId, "accepted") },
      ],
    });
    const loop = loopService(
      value,
      reviewService(value, reviewerRuntime),
      new FakeAgentAdapter({
        defaultScenario: { outcome: "success", output: { verified: true } },
      }),
    );
    const first = await loop.review({
      projectKey: value.projectKey,
      taskId,
      executionId: "EXEC-042" as ExecutionId,
      validation: validation(taskId, "EXEC-042" as ExecutionId),
    });
    assert.equal(first.ok, true);
    if (!first.ok) throw new Error(first.error.message);
    assert.equal(first.value.state, "changes_requested");
    assert.equal(first.value.task.task.status, "changes_requested");
    assert.equal(first.value.nextTaskReason, "rework_required");
    assert.equal(first.value.report.reviewRound, 1);

    const rework = await loop.rework({
      projectKey: value.projectKey,
      taskId,
      previousReportId: first.value.report.id,
    });
    assert.equal(rework.ok, true);
    if (!rework.ok) throw new Error(rework.error.message);
    assert.equal(rework.value.execution.task.task.status, "in_review");

    const secondExecutionId = rework.value.execution.run.executionId;
    const second = await loop.review({
      projectKey: value.projectKey,
      taskId,
      executionId: secondExecutionId,
      previousReportId: first.value.report.id,
      validation: validation(taskId, secondExecutionId),
    });
    assert.equal(second.ok, true);
    if (!second.ok) throw new Error(second.error.message);
    assert.equal(second.value.report.previousReportId, first.value.report.id);
    assert.equal(second.value.report.reviewRound, 2);
    assert.equal(
      second.value.report.reviewerInstanceId,
      first.value.report.reviewerInstanceId,
    );
    assert.equal(second.value.state, "waiting_for_approval");
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("completes an accepted review and selects only an eligible task in the same goal", async () => {
  const value = await fixture();
  try {
    const firstTaskId = await createTask(value, "First review loop task");
    const nextTaskId = await createTask(value, "Next eligible task");
    await moveToInReview(value, firstTaskId);
    const nextReady = await services(value).taskService.ready({
      projectKey: value.projectKey,
      taskId: nextTaskId,
    });
    assert.equal(nextReady.ok, true);
    if (!nextReady.ok) throw new Error(nextReady.error.message);

    const approval = new ApprovalService({
      registryFactory: services(value).registryFactory,
      now: () => timestamp,
    });
    const requested = await approval.request({
      projectKey: value.projectKey,
      approvalType: "short_term_goal_acceptance_and_main_merge",
      operation: "goal_acceptance",
      subjectId: "GOAL-009",
      requestedBy: "system",
      request: "Allow the approved goal to complete tasks.",
    });
    assert.equal(requested.ok, true);
    if (!requested.ok) throw new Error(requested.error.message);
    const decided = await approval.decide({
      projectKey: value.projectKey,
      approvalId: requested.value.approvalId,
      outcome: "approved",
      note: "Approved for the governed review loop.",
    });
    assert.equal(decided.ok, true);
    if (!decided.ok) throw new Error(decided.error.message);

    const loop = loopService(
      value,
      reviewService(
        value,
        new FakeAgentAdapter({
          defaultScenario: {
            outcome: "success",
            output: reviewerOutput(firstTaskId, "accepted"),
          },
        }),
      ),
      new FakeAgentAdapter(),
    );
    const result = await loop.review({
      projectKey: value.projectKey,
      taskId: firstTaskId,
      executionId: "EXEC-042" as ExecutionId,
      validation: validation(firstTaskId, "EXEC-042" as ExecutionId),
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error(result.error.message);
    assert.equal(result.value.state, "completed");
    assert.equal(result.value.task.task.status, "completed");
    assert.equal(result.value.nextTask?.task.id, nextTaskId);
    assert.equal(result.value.nextTaskReason, "selected");
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("does not start rework for an accepted report", async () => {
  const value = await fixture();
  try {
    const taskId = await createTask(value, "Accepted review task");
    await moveToInReview(value, taskId);
    const loop = loopService(
      value,
      reviewService(
        value,
        new FakeAgentAdapter({
          defaultScenario: {
            outcome: "success",
            output: reviewerOutput(taskId, "accepted"),
          },
        }),
      ),
      new FakeAgentAdapter(),
    );
    const review = await loop.review({
      projectKey: value.projectKey,
      taskId,
      executionId: "EXEC-042" as ExecutionId,
      validation: validation(taskId, "EXEC-042" as ExecutionId),
    });
    assert.equal(review.ok, true);
    if (!review.ok) throw new Error(review.error.message);
    const result = await loop.rework({
      projectKey: value.projectKey,
      taskId,
      previousReportId: review.value.report.id,
    });
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("Accepted report was reworked.");
    assert.equal(result.error.code, "review_chain_invalid");
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});
