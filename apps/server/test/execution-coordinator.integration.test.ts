import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";

import { buildApp } from "../src/app.js";
import { FakeAgentAdapter } from "../src/infrastructure/agent-runtime/fake-agent-adapter.js";
import {
  ExecutionCoordinatorService,
  ExecutionLock,
} from "../src/infrastructure/execution/execution-coordinator.js";
import { GoalService } from "../src/infrastructure/goals/goal-service.js";
import { IssueService } from "../src/infrastructure/issues/issue-service.js";
import { ProjectRegistryRepository } from "../src/infrastructure/registry/project-registry-repository.js";
import { TaskService } from "../src/infrastructure/tasks/task-service.js";

const timestamp = parseUtcIsoTimestamp("2026-08-15T08:00:00Z");

async function fixture(approved = true) {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-execution-"));
  const projectRoot = join(root, "project");
  await mkdir(join(projectRoot, ".personal-workspace", "goals"), {
    recursive: true,
  });
  await mkdir(join(projectRoot, ".personal-workspace", "tasks"), {
    recursive: true,
  });
  await writeFile(
    join(projectRoot, ".personal-workspace", "goals", "GOAL-001.md"),
    [
      "---",
      "schema_version: 1",
      "document_type: goal",
      "revision: 1",
      "created_at: 2026-08-15T08:00:00Z",
      "updated_at: 2026-08-15T08:00:00Z",
      "id: GOAL-001",
      "title: Governed execution",
      "boundary: [execution coordinator]",
      "risks: []",
      "acceptance_criteria: [one active execution]",
      "proposed_by: project-lead-agent",
      `status: ${approved ? "ready" : "draft"}`,
      ...(approved
        ? [
            "approval:",
            "  decidedBy: user",
            "  approved: true",
            "  decidedAt: 2026-08-15T08:00:00Z",
          ]
        : []),
      "---",
      "",
      "# GOAL-001",
      "",
    ].join("\n"),
  );
  const databasePath = join(root, "app.db");
  const registryDirectory = join(root, "registry");
  const registry = new ProjectRegistryRepository({
    databasePath,
    registryDirectory,
  });
  const registered = await registry.register({
    rootPath: projectRoot,
    name: "Execution fixture",
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
  return {
    taskService: new TaskService({ now: () => timestamp, registryFactory }),
    goalService: new GoalService({ now: () => timestamp, registryFactory }),
    issueService: new IssueService({ now: () => timestamp, registryFactory }),
  };
}

function taskPayload(
  projectKey: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    projectKey,
    goalId: "GOAL-001",
    title: "Run one governed task",
    currentRole: "executor",
    dependencies: [],
    purpose: "Coordinate one task execution.",
    scope: ["apps/server/src/infrastructure/execution"],
    outputs: ["execution result"],
    acceptanceCriteria: ["one active chain"],
    requiredFiles: ["apps/server/src"],
    onDemandFiles: ["README.md"],
    associatedDecisions: [],
    allowedPaths: ["apps/server/src/infrastructure/execution"],
    forbiddenPaths: [".git"],
    run: {
      mode: "local",
      gitBranch: "goal/GOAL-008",
      worktree: ".",
      verificationCommands: ["npm run verify"],
    },
    evidence: ["execution coordinator integration test"],
    completion: {
      output: "Coordinator result",
      tests: ["execution coordinator integration test"],
      outstandingIssues: [],
      handoff: "Pass execution evidence to the reviewer.",
    },
    ...extra,
  };
}

async function createReadyTask(
  value: Fixture,
  extra: Record<string, unknown> = {},
): Promise<{ readonly id: string }> {
  const { taskService } = services(value);
  const created = await taskService.create(
    taskPayload(value.projectKey, extra),
  );
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error(created.error.message);
  const ready = await taskService.ready({
    projectKey: value.projectKey,
    taskId: created.value.task.id,
  });
  assert.equal(ready.ok, true);
  if (!ready.ok) throw new Error(ready.error.message);
  return { id: ready.value.task.id };
}

function coordinator(
  value: Fixture,
  runtime: FakeAgentAdapter,
): ExecutionCoordinatorService {
  const configured = services(value);
  return new ExecutionCoordinatorService({
    runtime,
    ...configured,
    now: () => timestamp,
    lock: new ExecutionLock(),
  });
}

test("starts one ready task, enforces the global lock, and requires review", async () => {
  const value = await fixture();
  try {
    const task = await createReadyTask(value);
    const service = coordinator(
      value,
      new FakeAgentAdapter({ now: () => timestamp }),
    );
    const first = service.start({
      projectKey: value.projectKey,
      taskId: task.id,
    });
    const concurrent = await service.start({
      projectKey: value.projectKey,
      taskId: task.id,
    });
    assert.equal(concurrent.ok, false);
    if (!concurrent.ok) assert.equal(concurrent.error.code, "execution_active");
    const completed = await first;
    assert.equal(completed.ok, true);
    if (!completed.ok) throw new Error(completed.error.message);
    assert.equal(completed.value.run.status, "completed");
    assert.equal(completed.value.run.taskStatus, "in_review");
    assert.deepEqual(
      completed.value.run.events.map((event) => event.type),
      ["started", "progress", "completed"],
    );
    const stored = await readFile(
      join(value.projectRoot, ".personal-workspace", "tasks", `${task.id}.md`),
      "utf8",
    );
    assert.match(stored, /status: in_review/);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("rejects a task whose dependency is not completed", async () => {
  const value = await fixture();
  try {
    const dependency = await createReadyTask(value);
    const dependent = await createReadyTask(value, {
      title: "Dependent task",
      dependencies: [dependency.id],
    });
    const service = coordinator(
      value,
      new FakeAgentAdapter({ now: () => timestamp }),
    );
    const result = await service.start({
      projectKey: value.projectKey,
      taskId: dependent.id,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "dependency_not_ready");
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("pauses an interrupted execution and resumes the same execution", async () => {
  const value = await fixture();
  try {
    const task = await createReadyTask(value);
    const service = coordinator(
      value,
      new FakeAgentAdapter({
        now: () => timestamp,
        defaultScenario: { outcome: "interrupted", resumeOutcome: "success" },
      }),
    );
    const interrupted = await service.start({
      projectKey: value.projectKey,
      taskId: task.id,
    });
    assert.equal(interrupted.ok, true);
    if (!interrupted.ok) throw new Error(interrupted.error.message);
    assert.equal(interrupted.value.run.status, "interrupted");
    assert.equal(interrupted.value.run.taskStatus, "paused");
    const resumed = await service.resume({
      projectKey: value.projectKey,
      executionId: interrupted.value.run.executionId,
    });
    assert.equal(resumed.ok, true);
    if (!resumed.ok) throw new Error(resumed.error.message);
    assert.equal(
      resumed.value.run.executionId,
      interrupted.value.run.executionId,
    );
    assert.equal(resumed.value.run.status, "completed");
    assert.equal(resumed.value.run.taskStatus, "in_review");
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("restart exposes recovery choices and blocks the next task until resume", async () => {
  const value = await fixture();
  try {
    const runtime = new FakeAgentAdapter({
      now: () => timestamp,
      defaultScenario: { outcome: "interrupted", resumeOutcome: "success" },
    });
    const firstService = coordinator(value, runtime);
    const interrupted = await firstService.start({
      projectKey: value.projectKey,
      taskId: (await createReadyTask(value)).id,
    });
    assert.equal(interrupted.ok, true);
    if (!interrupted.ok) throw new Error(interrupted.error.message);
    const nextTask = await createReadyTask(value, { title: "Next task" });

    const restarted = coordinator(value, runtime);
    const blocked = await restarted.start({ projectKey: value.projectKey });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.error.code, "recovery_required");
    const state = await restarted.getState(value.projectKey);
    assert.equal(state.ok, true);
    if (state.ok) {
      assert.equal(
        state.value.recovery?.executionId,
        interrupted.value.run.executionId,
      );
      assert.deepEqual(state.value.recovery?.choices, [
        "resume",
        "retry",
        "cancel",
      ]);
    }

    const resumed = await restarted.resume({
      projectKey: value.projectKey,
      executionId: interrupted.value.run.executionId,
    });
    assert.equal(resumed.ok, true);
    if (!resumed.ok) throw new Error(resumed.error.message);
    assert.equal(resumed.value.run.status, "completed");
    assert.equal(resumed.value.run.taskStatus, "in_review");
    assert.equal(nextTask.id !== resumed.value.run.taskId, true);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("an open blocker pauses the task before an agent can start", async () => {
  const value = await fixture();
  try {
    const task = await createReadyTask(value);
    const { issueService } = services(value);
    const issue = await issueService.create({
      projectKey: value.projectKey,
      title: "Execution blocker",
      description: "The task cannot proceed yet.",
      severity: "blocker",
      impact: "task",
      affectedTaskIds: [task.id],
      affectedObjectIds: [],
      discussion: [],
      recoveryPlan: "Resolve the blocker first.",
    });
    assert.equal(issue.ok, true);
    const service = coordinator(
      value,
      new FakeAgentAdapter({ now: () => timestamp }),
    );
    const result = await service.start({
      projectKey: value.projectKey,
      taskId: task.id,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "task_not_ready");
    const page = await services(value).taskService.getTasks(value.projectKey);
    assert.equal(page.ok, true);
    if (page.ok) assert.equal(page.value.tasks[0]?.task.status, "paused");
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("exposes start and state through the execution API", async () => {
  const value = await fixture();
  try {
    const task = await createReadyTask(value);
    const configured = services(value);
    const execution = new ExecutionCoordinatorService({
      runtime: new FakeAgentAdapter({ now: () => timestamp }),
      ...configured,
      now: () => timestamp,
      lock: new ExecutionLock(),
    });
    const app = buildApp({ executionCoordinatorService: execution });
    const started = await app.inject({
      method: "POST",
      url: "/api/projects/execution/start",
      payload: { projectKey: value.projectKey, taskId: task.id },
    });
    assert.equal(started.statusCode, 200, started.body);
    assert.equal(started.json().value.run.taskStatus, "in_review");
    const state = await app.inject({
      method: "GET",
      url: `/api/projects/execution?projectKey=${value.projectKey}`,
    });
    assert.equal(state.statusCode, 200, state.body);
    assert.equal(state.json().value.active, false);
    await app.close();
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});
