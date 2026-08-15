import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
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
import {
  GitGoalMergeService,
  GitTaskDeliveryService,
} from "../src/infrastructure/git/git-delivery.js";
import { GitProcess } from "../src/infrastructure/git/git-process.js";
import { GoalService } from "../src/infrastructure/goals/goal-service.js";
import { IssueService } from "../src/infrastructure/issues/issue-service.js";
import { ProjectRegistryRepository } from "../src/infrastructure/registry/project-registry-repository.js";
import { ReviewLoopService } from "../src/infrastructure/reviews/review-loop-service.js";
import { ReviewService } from "../src/infrastructure/reviews/review-service.js";
import { RoleService } from "../src/infrastructure/roles/role-service.js";
import { TaskPackageService } from "../src/infrastructure/execution/task-package-service.js";
import {
  TaskResultValidationService,
  type TaskResultValidationReport,
} from "../src/infrastructure/execution/task-result-validation.js";
import { TaskService } from "../src/infrastructure/tasks/task-service.js";

const timestamp = parseUtcIsoTimestamp("2026-08-15T12:00:00Z");

async function runGit(root: string, args: readonly string[]): Promise<void> {
  const result = await new GitProcess().run(args, root);
  assert.equal(result.exitCode, 0, result.stderr);
}

async function gitOutput(
  root: string,
  args: readonly string[],
): Promise<string> {
  const result = await new GitProcess().run(args, root);
  assert.equal(result.exitCode, 0, result.stderr);
  return result.stdout.trim();
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

function coordinator(
  value: Fixture,
  runtime: AgentRuntime,
): ExecutionCoordinatorService {
  const configured = services(value);
  return new ExecutionCoordinatorService({
    runtime,
    taskService: configured.taskService,
    goalService: configured.goalService,
    issueService: configured.issueService,
    lock: new ExecutionLock(),
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

test("V0.2 completes recovery, rework, review, governed delivery, and the main approval gate", async () => {
  const value = await fixture();
  try {
    const taskId = await createTask(value, "V0.2 full-chain acceptance");
    assert.equal(taskId, "TASK-001");
    await runGit(value.projectRoot, ["branch", "goal/GOAL-009"]);
    await runGit(value.projectRoot, [
      "switch",
      "-c",
      `task/${taskId}`,
      "goal/GOAL-009",
    ]);
    const ready = await services(value).taskService.ready({
      projectKey: value.projectKey,
      taskId,
    });
    assert.equal(ready.ok, true);
    if (!ready.ok) throw new Error(ready.error.message);

    const executorRuntime = new FakeAgentAdapter({
      scenarios: [
        {
          outcome: "interrupted",
          resumeOutcome: "success",
          output: { verified: true, summary: "Recovered executor result" },
        },
        {
          outcome: "success",
          output: { verified: true, summary: "Rework completed" },
        },
      ],
    });
    const interrupted = await coordinator(value, executorRuntime).start({
      projectKey: value.projectKey,
      taskId,
    });
    assert.equal(interrupted.ok, true);
    if (!interrupted.ok) throw new Error(interrupted.error.message);
    assert.equal(interrupted.value.run.status, "interrupted");
    assert.equal(interrupted.value.run.recovery?.required, true);

    const restartedCoordinator = coordinator(value, executorRuntime);
    const recoveryState = await restartedCoordinator.getState(value.projectKey);
    assert.equal(recoveryState.ok, true);
    if (!recoveryState.ok) throw new Error(recoveryState.error.message);
    assert.equal(recoveryState.value.recovery?.executionId, "EXEC-001");
    const resumed = await restartedCoordinator.resume({
      projectKey: value.projectKey,
      executionId: "EXEC-001",
    });
    assert.equal(resumed.ok, true);
    if (!resumed.ok) throw new Error(resumed.error.message);
    assert.equal(resumed.value.run.status, "completed");
    assert.equal(resumed.value.run.taskStatus, "in_review");
    assert.equal(resumed.value.run.result?.output?.verified, true);

    const boundary = new GitChangeBoundaryService();
    const firstBaseline = await boundary.capture(value.projectRoot);
    assert.equal(firstBaseline.ok, true);
    if (!firstBaseline.ok) throw new Error(firstBaseline.error.message);
    await writeFile(join(value.projectRoot, "result.txt"), "first draft\n");
    const validator = new TaskResultValidationService({
      boundary,
      commandRunner: async (command) => ({
        command,
        exitCode: 0,
        stdout: "V0.2 verification passed",
        stderr: "",
        error: null,
      }),
    });
    const firstValidation = await validator.validate({
      projectRoot: value.projectRoot,
      task: resumed.value.task,
      baseline: firstBaseline.value,
      executionId: resumed.value.run.executionId,
      result: resumed.value.run.result!,
    });
    assert.equal(firstValidation.ok, true);
    if (!firstValidation.ok) throw new Error(firstValidation.error.message);
    assert.equal(firstValidation.value.passed, true);
    assert.equal(firstValidation.value.boundary.changes[0]?.path, "result.txt");

    const firstLoop = loopService(
      value,
      reviewService(
        value,
        new FakeAgentAdapter({
          defaultScenario: {
            outcome: "success",
            output: reviewerOutput(taskId, "changes_requested"),
          },
        }),
      ),
      executorRuntime,
    );
    const firstReview = await firstLoop.review({
      projectKey: value.projectKey,
      taskId,
      executionId: resumed.value.run.executionId,
      validation: firstValidation.value,
    });
    assert.equal(firstReview.ok, true);
    if (!firstReview.ok) throw new Error(firstReview.error.message);
    assert.equal(firstReview.value.state, "changes_requested");

    const rework = await firstLoop.rework({
      projectKey: value.projectKey,
      taskId,
      previousReportId: firstReview.value.report.id,
    });
    assert.equal(rework.ok, true);
    if (!rework.ok) throw new Error(rework.error.message);
    const secondBaseline = await boundary.capture(value.projectRoot);
    assert.equal(secondBaseline.ok, true);
    if (!secondBaseline.ok) throw new Error(secondBaseline.error.message);
    await writeFile(join(value.projectRoot, "result.txt"), "accepted result\n");
    const secondValidation = await validator.validate({
      projectRoot: value.projectRoot,
      task: rework.value.execution.task,
      baseline: secondBaseline.value,
      executionId: rework.value.execution.run.executionId,
      result: rework.value.execution.run.result!,
    });
    assert.equal(secondValidation.ok, true);
    if (!secondValidation.ok) throw new Error(secondValidation.error.message);
    assert.equal(secondValidation.value.passed, true);

    const freshReviewLoop = loopService(
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
    const acceptedReview = await freshReviewLoop.review({
      projectKey: value.projectKey,
      taskId,
      executionId: rework.value.execution.run.executionId,
      previousReportId: firstReview.value.report.id,
      validation: secondValidation.value,
    });
    assert.equal(acceptedReview.ok, true);
    if (!acceptedReview.ok) throw new Error(acceptedReview.error.message);
    assert.equal(acceptedReview.value.state, "waiting_for_approval");
    assert.equal(acceptedReview.value.report.reviewRound, 2);
    assert.equal(
      acceptedReview.value.report.reviewerInstanceId,
      firstReview.value.report.reviewerInstanceId,
    );
    assert.match(acceptedReview.value.report.handoff, /governed review loop/i);

    const approvalService = new ApprovalService({
      registryFactory: services(value).registryFactory,
      now: () => timestamp,
    });
    const requested = await approvalService.request({
      projectKey: value.projectKey,
      approvalType: "short_term_goal_acceptance_and_main_merge",
      operation: "goal_acceptance",
      subjectId: "GOAL-009",
      requestedBy: "system",
      request: "Accept the V0.2 goal result without authorizing main merge.",
    });
    assert.equal(requested.ok, true);
    if (!requested.ok) throw new Error(requested.error.message);
    const decided = await approvalService.decide({
      projectKey: value.projectKey,
      approvalId: requested.value.approvalId,
      outcome: "approved",
      note: "The temporary V0.2 task may complete.",
    });
    assert.equal(decided.ok, true);
    if (!decided.ok) throw new Error(decided.error.message);

    const restartedLoop = loopService(
      value,
      reviewService(value, new FakeAgentAdapter()),
      new FakeAgentAdapter(),
    );
    const advanced = await restartedLoop.advance({
      projectKey: value.projectKey,
      taskId,
      reportId: acceptedReview.value.report.id,
    });
    assert.equal(advanced.ok, true);
    if (!advanced.ok) throw new Error(advanced.error.message);
    assert.equal(advanced.value.state, "completed");
    assert.equal(advanced.value.task.task.status, "completed");

    const goalHeadBeforeDelivery = await gitOutput(value.projectRoot, [
      "rev-parse",
      "goal/GOAL-009",
    ]);
    await writeFile(join(value.projectRoot, "outside.txt"), "unauthorized\n");
    const delivery = new GitTaskDeliveryService();
    const deliveryPaths = [
      "result.txt",
      ".personal-workspace/tasks",
      ".personal-workspace/reviews",
      ".personal-workspace/approvals",
      ".personal-workspace/audit",
      ".personal-workspace/executions",
    ];
    const deniedDelivery = await delivery.deliverTask({
      projectRoot: value.projectRoot,
      goalId: "GOAL-009",
      taskId,
      taskStatus: advanced.value.task.task.status,
      accepted: true,
      allowedPaths: deliveryPaths,
      forbiddenPaths: [".git"],
      commitType: "test",
      commitScope: "v02",
      commitDescription: "验证全链路交付",
    });
    assert.equal(deniedDelivery.ok, false);
    if (deniedDelivery.ok)
      throw new Error("Unauthorized change entered the goal branch.");
    assert.equal(deniedDelivery.error.code, "boundary_violation");
    assert.equal(
      await gitOutput(value.projectRoot, ["rev-parse", "goal/GOAL-009"]),
      goalHeadBeforeDelivery,
    );
    await unlink(join(value.projectRoot, "outside.txt"));

    const delivered = await delivery.deliverTask({
      projectRoot: value.projectRoot,
      goalId: "GOAL-009",
      taskId,
      taskStatus: advanced.value.task.task.status,
      accepted: true,
      allowedPaths: deliveryPaths,
      forbiddenPaths: [".git"],
      commitType: "test",
      commitScope: "v02",
      commitDescription: "验证全链路交付",
    });
    assert.equal(
      delivered.ok,
      true,
      delivered.ok
        ? ""
        : `${delivered.error.code}: ${delivered.error.message} ${delivered.error.details.join(" | ")}`,
    );
    if (!delivered.ok) throw new Error(delivered.error.message);
    assert.equal(delivered.value.goalBranch, "goal/GOAL-009");
    const commitMessage = await gitOutput(value.projectRoot, [
      "log",
      "-1",
      "--format=%s%n%b",
    ]);
    assert.match(commitMessage, /merge\(task\): 合并 TASK-001/);
    assert.match(commitMessage, /Tasks: TASK-001/);

    const mainBefore = await gitOutput(value.projectRoot, [
      "rev-parse",
      "main",
    ]);
    const deniedMain = await new GitGoalMergeService().mergeGoal({
      projectRoot: value.projectRoot,
      goalId: "GOAL-009",
      taskId,
    });
    assert.equal(deniedMain.ok, false);
    if (deniedMain.ok) throw new Error("Main merge bypassed user approval.");
    assert.equal(deniedMain.error.code, "approval_required");
    assert.equal(
      await gitOutput(value.projectRoot, ["rev-parse", "main"]),
      mainBefore,
    );
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});
