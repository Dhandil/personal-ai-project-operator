import { strict as assert } from "node:assert";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type {
  AgentSession,
  AgentStartRequest,
  AgentRuntime,
  ExecutionId,
  TaskId,
} from "@personal-ai-operator/contracts";
import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";

import { AuditLogRepository } from "../src/infrastructure/audit/audit-log-repository.js";
import {
  FakeAgentAdapter,
  type FakeAgentScenario,
} from "../src/infrastructure/agent-runtime/fake-agent-adapter.js";
import { GitChangeBoundaryService } from "../src/infrastructure/git/git-change-boundary.js";
import { GoalService } from "../src/infrastructure/goals/goal-service.js";
import { ReviewService } from "../src/infrastructure/reviews/review-service.js";
import { ReviewReportRepository } from "../src/infrastructure/reviews/review-report-repository.js";
import { ProjectRegistryRepository } from "../src/infrastructure/registry/project-registry-repository.js";
import { RoleService } from "../src/infrastructure/roles/role-service.js";
import { TaskPackageService } from "../src/infrastructure/execution/task-package-service.js";
import type { TaskResultValidationReport } from "../src/infrastructure/execution/task-result-validation.js";
import { TaskService } from "../src/infrastructure/tasks/task-service.js";
import { GitProcess } from "../src/infrastructure/git/git-process.js";

const timestamp = parseUtcIsoTimestamp("2026-08-15T12:00:00Z");
const executionId = "EXEC-042" as ExecutionId;

async function runGit(root: string, args: readonly string[]): Promise<void> {
  const result = await new GitProcess().run(args, root);
  assert.equal(
    result.exitCode,
    0,
    `${args.join(" ")} failed: ${result.stderr}`,
  );
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-review-"));
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
      "title: Review goal",
      "boundary: [review]",
      "risks: []",
      "acceptance_criteria: [review is read-only]",
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
    name: "Review fixture",
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
  const roleService = new RoleService({ registryFactory });
  return {
    registryFactory,
    taskService,
    taskPackageService: new TaskPackageService({
      taskService,
      goalService,
      roleService,
    }),
  };
}

async function createTask(value: Fixture): Promise<TaskId> {
  const created = await services(value).taskService.create({
    projectKey: value.projectKey,
    goalId: "GOAL-009",
    title: "Review execution result",
    currentRole: "executor",
    dependencies: [],
    purpose: "Review a bounded execution.",
    scope: ["result.txt"],
    outputs: ["review report"],
    acceptanceCriteria: ["read-only review"],
    requiredFiles: ["result.txt"],
    onDemandFiles: ["README.md"],
    associatedDecisions: [],
    allowedPaths: ["result.txt"],
    forbiddenPaths: [".git", ".personal-workspace/audit"],
    run: {
      mode: "local",
      gitBranch: "goal/GOAL-009",
      worktree: ".",
      verificationCommands: ["npm run test:integration -- review"],
    },
    evidence: ["execution validation"],
    completion: {
      output: "Execution output",
      tests: ["review.integration.test.ts"],
      outstandingIssues: [],
      handoff: "Reviewer reports findings.",
    },
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error(created.error.message);
  return created.value.task.id;
}

function validation(reviewTaskId: TaskId): TaskResultValidationReport {
  return {
    passed: true,
    executionId,
    taskId: reviewTaskId,
    claimedStatus: "completed",
    artifacts: [{ path: "result.txt", exists: true, kind: "file" }],
    verification: [
      {
        command: "npm run test:integration -- review",
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
  decision: "accepted" | "changes_requested" | "blocked",
  reviewTaskId: TaskId,
) {
  return {
    schemaVersion: 1,
    kind: "reviewer_result",
    taskId: reviewTaskId,
    decision,
    findings: JSON.stringify([
      { severity: "low", path: "result.txt", message: "Reviewed actual diff." },
    ]),
    verificationEvidence: JSON.stringify([
      "The approved verification command passed.",
    ]),
    requiredChanges: JSON.stringify(
      decision === "accepted" ? [] : ["Address the reported finding."],
    ),
    handoff: "Pass the structured review to the next governance gate.",
  } as const;
}

class RecordingRuntime extends FakeAgentAdapter {
  public request: AgentStartRequest | null = null;

  public override async start(
    request: AgentStartRequest,
    scenario?: FakeAgentScenario,
  ): Promise<AgentSession> {
    this.request = request;
    return super.start(request, scenario);
  }
}

function reviewService(
  value: Fixture,
  runtime: AgentRuntime,
  reportRepository = new ReviewReportRepository(),
): ReviewService {
  const configured = services(value);
  return new ReviewService({
    runtime,
    taskPackageService: configured.taskPackageService,
    reportRepository,
    boundary: new GitChangeBoundaryService(),
    registryFactory: configured.registryFactory,
    now: () => timestamp,
  });
}

test("runs the reviewer with read-only package and persists a structured report", async () => {
  const value = await fixture();
  try {
    const reviewTaskId = await createTask(value);
    const runtime = new RecordingRuntime({
      defaultScenario: {
        outcome: "success",
        output: reviewerOutput("accepted", reviewTaskId),
      },
    });
    const result = await reviewService(value, runtime).review({
      projectKey: value.projectKey,
      taskId: reviewTaskId,
      executionId,
      validation: validation(reviewTaskId),
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error(result.error.message);
    assert.equal(result.value.decision, "accepted");
    assert.equal(result.value.readOnly, true);
    assert.equal(result.value.sandbox, "read-only");
    assert.equal(result.value.diff.changes[0]?.path, "result.txt");
    assert.equal(result.value.files[0]?.path, "result.txt");
    assert.equal(
      result.value.tests[0]?.command,
      "npm run test:integration -- review",
    );
    assert.equal(runtime.request?.role, "reviewer");
    assert.equal(runtime.request?.workingDirectory, value.projectRoot);
    const stored = await new ReviewReportRepository().read(
      value.projectRoot,
      result.value.id,
    );
    assert.equal(stored.ok, true);
    if (!stored.ok) throw new Error(stored.error.message);
    assert.deepEqual(stored.value, result.value);
    assert.match(
      await readFile(
        join(
          value.projectRoot,
          ".personal-workspace",
          "reviews",
          `${result.value.id}.md`,
        ),
        "utf8",
      ),
      /Reviewed actual diff|Review report/,
    );
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("blocks and audits a reviewer privilege violation without saving a report", async () => {
  const value = await fixture();
  try {
    const reviewTaskId = await createTask(value);
    const runtime = new FakeAgentAdapter({
      defaultScenario: {
        outcome: "privilege_violation",
        message: "reviewer attempted to write a project file",
      },
    });
    const result = await reviewService(value, runtime).review({
      projectKey: value.projectKey,
      taskId: reviewTaskId,
      executionId,
      validation: validation(reviewTaskId),
    });
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("Privilege violation was accepted.");
    assert.equal(result.error.code, "privilege_violation");
    await assert.rejects(
      readdir(join(value.projectRoot, ".personal-workspace", "reviews")),
    );
    const audit = await new AuditLogRepository(value.projectRoot).readAll();
    assert.equal(audit.ok, true);
    if (!audit.ok) throw new Error(audit.error.message);
    assert.equal(audit.value.length, 2);
    const violation = audit.value.find(
      (event) => event.type === "privilege_violation",
    );
    assert.ok(violation);
    assert.match(violation.action, /read-only reviewer/);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("rejects malformed reviewer output without writing a formal report", async () => {
  const value = await fixture();
  try {
    const reviewTaskId = await createTask(value);
    const runtime = new FakeAgentAdapter({
      defaultScenario: {
        outcome: "success",
        output: { summary: "not reviewer_result_v1" },
      },
    });
    const result = await reviewService(value, runtime).review({
      projectKey: value.projectKey,
      taskId: reviewTaskId,
      executionId,
      validation: validation(reviewTaskId),
    });
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("Malformed reviewer output was accepted.");
    assert.equal(result.error.code, "review_output_invalid");
    await assert.rejects(
      readdir(join(value.projectRoot, ".personal-workspace", "reviews")),
    );
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});
