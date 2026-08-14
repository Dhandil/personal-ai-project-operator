import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";

import { buildApp } from "../src/app.js";
import { GoalService } from "../src/infrastructure/goals/goal-service.js";
import { ProjectRegistryRepository } from "../src/infrastructure/registry/project-registry-repository.js";
import { RoleService } from "../src/infrastructure/roles/role-service.js";
import { TaskPackageService } from "../src/infrastructure/execution/task-package-service.js";
import { TaskService } from "../src/infrastructure/tasks/task-service.js";

const timestamp = parseUtcIsoTimestamp("2026-08-15T09:00:00Z");

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-task-package-"));
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
      "created_at: 2026-08-15T09:00:00Z",
      "updated_at: 2026-08-15T09:00:00Z",
      "id: GOAL-001",
      "title: Task package goal",
      "boundary: [task package]",
      "risks: []",
      "acceptance_criteria: [role boundaries remain explicit]",
      "proposed_by: project-lead-agent",
      "status: ready",
      "approval:",
      "  decidedBy: user",
      "  approved: true",
      "  decidedAt: 2026-08-15T09:00:00Z",
      "---",
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
    name: "Task package fixture",
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
    roleService: new RoleService({ registryFactory }),
  };
}

async function readyTask(value: Fixture): Promise<string> {
  const { taskService } = services(value);
  const created = await taskService.create({
    projectKey: value.projectKey,
    goalId: "GOAL-001",
    title: "Build a bounded task package",
    currentRole: "executor",
    dependencies: [],
    purpose: "Provide only the context required by the assigned role.",
    scope: ["apps/server/src/infrastructure/execution"],
    outputs: ["task package"],
    acceptanceCriteria: ["executor and reviewer contracts differ"],
    requiredFiles: ["apps/server/src/infrastructure/execution"],
    onDemandFiles: ["README.md"],
    associatedDecisions: [],
    allowedPaths: ["apps/server/src/infrastructure/execution"],
    forbiddenPaths: [".git", ".personal-workspace/audit"],
    run: {
      mode: "local",
      gitBranch: "goal/GOAL-008",
      worktree: ".",
      verificationCommands: ["npm run test:unit -- task-package"],
    },
    evidence: ["fixed fixture snapshot"],
    completion: {
      output: "Task package output",
      tests: ["task-package.integration.test.ts"],
      outstandingIssues: [],
      handoff: "Reviewer checks the role-specific result.",
    },
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error(created.error.message);
  const ready = await taskService.ready({
    projectKey: value.projectKey,
    taskId: created.value.task.id,
  });
  assert.equal(ready.ok, true);
  if (!ready.ok) throw new Error(ready.error.message);
  return ready.value.task.id;
}

function packageService(value: Fixture): TaskPackageService {
  return new TaskPackageService(services(value));
}

test("builds an executor package from bounded facts and actual paths", async () => {
  const value = await fixture();
  try {
    const taskId = await readyTask(value);
    const result = await packageService(value).build({
      projectKey: value.projectKey,
      taskId,
      role: "executor",
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error(result.error.message);
    assert.equal(result.value.kind, "task_package");
    assert.equal(result.value.role, "executor");
    assert.equal(result.value.outputSchema.id, "executor_result_v1");
    assert.equal(result.value.permissions.mode, "workspace_write");
    assert.equal(result.value.permissions.canModifyProjectFiles, true);
    assert.equal(result.value.paths.workingDirectory, value.projectRoot);
    assert.ok(
      result.value.context.mustRead.some((item) =>
        item.absolutePaths.includes(
          join(value.projectRoot, ".personal-workspace", "tasks"),
        ),
      ),
    );
    assert.ok(
      result.value.context.mustRead.some((item) =>
        item.absolutePaths.includes(
          join(value.projectRoot, "apps/server/src/infrastructure/execution"),
        ),
      ),
    );
    assert.equal("chatHistory" in result.value, false);
    assert.equal("allProjectFiles" in result.value, false);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("builds a read-only reviewer package with a different output schema", async () => {
  const value = await fixture();
  try {
    const taskId = await readyTask(value);
    const result = await packageService(value).build({
      projectKey: value.projectKey,
      taskId,
      role: "reviewer",
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error(result.error.message);
    assert.equal(result.value.role, "reviewer");
    assert.equal(result.value.outputSchema.id, "reviewer_result_v1");
    assert.equal(result.value.permissions.mode, "read_only");
    assert.equal(result.value.permissions.canModifyProjectFiles, false);
    assert.ok(
      result.value.permissions.forbiddenActions.includes(
        "modify implementation",
      ),
    );
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("exposes task packages through the API", async () => {
  const value = await fixture();
  try {
    const taskId = await readyTask(value);
    const app = buildApp({ taskPackageService: packageService(value) });
    const response = await app.inject({
      method: "GET",
      url: `/api/projects/task-packages?projectKey=${value.projectKey}&taskId=${taskId}&role=reviewer`,
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().value.outputSchema.id, "reviewer_result_v1");
    await app.close();
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});
