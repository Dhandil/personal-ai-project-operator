import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { AgentResult, ExecutionId } from "@personal-ai-operator/contracts";
import type { Task } from "@personal-ai-operator/domain";

import { AuditLogRepository } from "../src/infrastructure/audit/audit-log-repository.js";
import {
  TaskResultValidationService,
  type VerificationCommandResult,
} from "../src/infrastructure/execution/task-result-validation.js";
import { GitChangeBoundaryService } from "../src/infrastructure/git/git-change-boundary.js";
import { GitProcess } from "../src/infrastructure/git/git-process.js";
import type { TaskSnapshot } from "../src/infrastructure/tasks/task-service.js";

const executionId = "EXEC-042" as ExecutionId;

async function runGit(root: string, args: readonly string[]): Promise<void> {
  const result = await new GitProcess().run(args, root);
  assert.equal(
    result.exitCode,
    0,
    `${args.join(" ")} failed: ${result.stderr}`,
  );
}

async function createRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-result-validation-"));
  await runGit(root, ["init", "--initial-branch=main"]);
  await runGit(root, ["config", "user.name", "Test User"]);
  await runGit(root, ["config", "user.email", "test@example.com"]);
  await writeFile(join(root, "result.txt"), "initial\n", "utf8");
  await mkdir(join(root, "allowed"));
  await runGit(root, ["add", "--", "."]);
  await runGit(root, ["commit", "-m", "initial"]);
  return root;
}

function task(requiredFiles: readonly string[] = ["result.txt"]): Task {
  return {
    id: "TASK-042",
    title: "Validate task result",
    status: "in_progress",
    goalId: "GOAL-009",
    currentRole: "executor",
    dependencies: [],
    purpose: "Validate bounded execution output.",
    scope: ["result.txt"],
    outputs: ["validated result"],
    acceptanceCriteria: ["reject incomplete evidence"],
    requiredFiles,
    onDemandFiles: ["README.md"],
    associatedDecisions: [],
    allowedPaths: ["result.txt"],
    forbiddenPaths: [".git", ".personal-workspace/audit"],
    run: {
      mode: "local",
      gitBranch: "goal/GOAL-009",
      worktree: ".",
      verificationCommands: [
        "npm run test:integration -- task-result-validation",
      ],
    },
    evidence: ["verification output", "bounded diff"],
    customFieldDefinitions: [],
    customFields: {},
    completion: {
      output: "Validation result",
      tests: ["task-result-validation.integration.test.ts"],
      outstandingIssues: [],
      handoff: "Reviewer checks the reusable report.",
    },
  };
}

function result(overrides: Partial<AgentResult> = {}): AgentResult {
  return {
    executionId,
    status: "completed",
    output: { verified: true },
    error: null,
    diagnostics: [],
    ...overrides,
  };
}

function commandRunner(exitCode = 0): Readonly<{
  readonly commands: string[];
  readonly runner: (
    command: string,
    projectRoot: string,
  ) => Promise<VerificationCommandResult>;
}> {
  const commands: string[] = [];
  return {
    commands,
    runner: async (command, projectRoot) => {
      commands.push(`${command}@${projectRoot}`);
      return {
        command,
        exitCode,
        stdout: exitCode === 0 ? "passed" : "failed",
        stderr: exitCode === 0 ? "" : "test failure",
        error: exitCode === 0 ? null : "verification failed",
      };
    },
  };
}

async function request(
  root: string,
  snapshot: TaskSnapshot,
  resultValue: AgentResult = result(),
  runner = commandRunner(),
) {
  const boundary = new GitChangeBoundaryService();
  const baseline = await boundary.capture(root);
  assert.equal(baseline.ok, true);
  if (!baseline.ok) throw new Error(baseline.error.message);
  const validation = await new TaskResultValidationService({
    boundary,
    commandRunner: runner.runner,
  }).validate({
    projectRoot: root,
    task: snapshot,
    baseline: baseline.value,
    executionId,
    result: resultValue,
  });
  return { validation, runner };
}

test("accepts a completed result only after validating artifacts, commands, and diff", async () => {
  const root = await createRepository();
  try {
    const boundary = new GitChangeBoundaryService();
    const baseline = await boundary.capture(root);
    assert.equal(baseline.ok, true);
    if (!baseline.ok) throw new Error(baseline.error.message);
    await writeFile(join(root, "result.txt"), "validated\n", "utf8");
    const runner = commandRunner();
    const snapshot: TaskSnapshot = {
      task: task(),
      revision: 1,
      hash: "task-hash",
    };
    const validation = await new TaskResultValidationService({
      boundary,
      commandRunner: runner.runner,
    }).validate({
      projectRoot: root,
      task: snapshot,
      baseline: baseline.value,
      executionId,
      result: result(),
    });

    assert.equal(validation.ok, true);
    if (!validation.ok) throw new Error(validation.error.message);
    assert.equal(validation.value.passed, true);
    assert.equal(validation.value.boundary.changes[0]?.path, "result.txt");
    assert.deepEqual(runner.commands, [
      `npm run test:integration -- task-result-validation@${root}`,
    ]);
    assert.equal(snapshot.task.status, "in_progress");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects an Agent claim without verified evidence and never changes task status", async () => {
  const root = await createRepository();
  try {
    const snapshot: TaskSnapshot = {
      task: task(),
      revision: 1,
      hash: "task-hash",
    };
    const checked = await request(root, snapshot, result({ output: null }));
    assert.equal(checked.validation.ok, true);
    if (!checked.validation.ok)
      throw new Error(checked.validation.error.message);
    assert.equal(checked.validation.value.passed, false);
    assert.equal(checked.validation.value.evidence.verified, false);
    assert.match(checked.validation.value.reasons.join("\n"), /verified=true/);
    assert.equal(snapshot.task.status, "in_progress");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a non-completed Agent result", async () => {
  const root = await createRepository();
  try {
    const checked = await request(
      root,
      { task: task(), revision: 1, hash: "task-hash" },
      result({
        status: "failed",
        error: { code: "execution_failed", message: "failed" },
      }),
    );
    assert.equal(checked.validation.ok, true);
    if (!checked.validation.ok)
      throw new Error(checked.validation.error.message);
    assert.equal(checked.validation.value.passed, false);
    assert.match(checked.validation.value.reasons.join("\n"), /not completed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects missing required artifacts", async () => {
  const root = await createRepository();
  try {
    const checked = await request(root, {
      task: task(["missing.txt"]),
      revision: 1,
      hash: "task-hash",
    });
    assert.equal(checked.validation.ok, true);
    if (!checked.validation.ok)
      throw new Error(checked.validation.error.message);
    assert.equal(checked.validation.value.passed, false);
    assert.deepEqual(checked.validation.value.artifacts, [
      { path: "missing.txt", exists: false, kind: "missing" },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects failed verification commands from the task card", async () => {
  const root = await createRepository();
  try {
    const runner = commandRunner(1);
    const checked = await request(
      root,
      { task: task(), revision: 1, hash: "task-hash" },
      result(),
      runner,
    );
    assert.equal(checked.validation.ok, true);
    if (!checked.validation.ok)
      throw new Error(checked.validation.error.message);
    assert.equal(checked.validation.value.passed, false);
    assert.equal(checked.validation.value.verification[0]?.exitCode, 1);
    assert.match(
      checked.validation.value.reasons.join("\n"),
      /Verification command failed/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects boundary violations and records privilege_violation evidence", async () => {
  const root = await createRepository();
  try {
    const boundary = new GitChangeBoundaryService();
    const baseline = await boundary.capture(root);
    assert.equal(baseline.ok, true);
    if (!baseline.ok) throw new Error(baseline.error.message);
    await writeFile(join(root, "outside.txt"), "not allowed\n", "utf8");
    const validation = await new TaskResultValidationService({
      boundary,
      commandRunner: commandRunner().runner,
    }).validate({
      projectRoot: root,
      task: { task: task(), revision: 1, hash: "task-hash" },
      baseline: baseline.value,
      executionId,
      result: result(),
      auditContext: {
        executionId,
        occurredAt: "2026-08-15T10:00:00Z",
        relatedObjectIds: ["TASK-042"],
      },
    });
    assert.equal(validation.ok, true);
    if (!validation.ok) throw new Error(validation.error.message);
    assert.equal(validation.value.passed, false);
    assert.equal(
      validation.value.boundary.violations.some(
        (violation) => violation.code === "path_not_allowed",
      ),
      true,
    );
    const audit = await new AuditLogRepository(root).readAll();
    assert.equal(audit.ok, true);
    if (!audit.ok) throw new Error(audit.error.message);
    assert.equal(audit.value.at(-1)?.type, "privilege_violation");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects invalid required artifact paths", async () => {
  const root = await createRepository();
  try {
    const checked = await request(root, {
      task: task(["../escape.txt"]),
      revision: 1,
      hash: "task-hash",
    });
    assert.equal(checked.validation.ok, true);
    if (!checked.validation.ok)
      throw new Error(checked.validation.error.message);
    assert.equal(checked.validation.value.passed, false);
    assert.equal(checked.validation.value.artifacts[0]?.kind, "invalid_path");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("does not run a shell expression even when it is present in a task card", async () => {
  const root = await createRepository();
  try {
    const boundary = new GitChangeBoundaryService();
    const baseline = await boundary.capture(root);
    assert.equal(baseline.ok, true);
    if (!baseline.ok) throw new Error(baseline.error.message);
    const validation = await new TaskResultValidationService({
      boundary,
    }).validate({
      projectRoot: root,
      task: {
        task: {
          ...task(),
          run: {
            ...task().run,
            verificationCommands: ["npm run verify; touch outside.txt"],
          },
        },
        revision: 1,
        hash: "task-hash",
      },
      baseline: baseline.value,
      executionId,
      result: result(),
    });
    assert.equal(validation.ok, true);
    if (!validation.ok) throw new Error(validation.error.message);
    assert.equal(validation.value.passed, false);
    assert.equal(validation.value.verification[0]?.error !== null, true);
    await assert.rejects(readFile(join(root, "outside.txt")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
