import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";

import { TaskService } from "../src/infrastructure/tasks/task-service.js";
import { ProjectRegistryRepository } from "../src/infrastructure/registry/project-registry-repository.js";

const timestamp = parseUtcIsoTimestamp("2026-08-14T11:30:00Z");

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-task-"));
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
      "created_at: 2026-08-14T11:30:00Z",
      "updated_at: 2026-08-14T11:30:00Z",
      "id: GOAL-001",
      "title: Governed task work",
      "boundary: [task model]",
      "risks: []",
      "acceptance_criteria: [task facts are valid]",
      "proposed_by: project-lead-agent",
      "status: ready",
      "approval:",
      "  decidedBy: user",
      "  approved: true",
      "  decidedAt: 2026-08-14T11:30:00Z",
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
    name: "Task fixture",
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

function service(value: Awaited<ReturnType<typeof fixture>>): TaskService {
  return new TaskService({
    now: () => timestamp,
    registryFactory: () =>
      new ProjectRegistryRepository({
        databasePath: value.databasePath,
        registryDirectory: value.registryDirectory,
      }),
  });
}

function taskPayload(projectKey: string, extra: Record<string, unknown> = {}) {
  return {
    projectKey,
    goalId: "GOAL-001",
    title: "Implement task facts",
    currentRole: "executor",
    dependencies: [],
    purpose: "Keep the task fact complete.",
    scope: ["task service"],
    outputs: ["task API"],
    acceptanceCriteria: ["required fields remain present"],
    requiredFiles: ["apps/server/src"],
    onDemandFiles: ["README.md"],
    associatedDecisions: [],
    allowedPaths: ["apps/server/src"],
    forbiddenPaths: [".git"],
    run: {
      mode: "local",
      gitBranch: "goal/GOAL-001",
      worktree: ".",
      verificationCommands: ["npm run verify"],
    },
    evidence: ["integration test"],
    customFieldDefinitions: [
      {
        key: "priority",
        label: "Priority",
        type: "single_select",
        required: true,
        options: ["high", "low"],
      },
    ],
    customFields: { priority: "high" },
    completion: {
      output: "Task fact implementation",
      tests: ["task integration"],
      outstandingIssues: [],
      handoff: "Review the task service.",
    },
    ...extra,
  };
}

test("task creation assigns a role, validates custom fields, and preserves unknown YAML on edit", async () => {
  const value = await fixture();
  try {
    const tasks = service(value);
    const created = await tasks.create(taskPayload(value.projectKey));
    assert.equal(created.ok, true);
    if (!created.ok) throw new Error(created.error.message);
    assert.equal(created.value.task.id, "TASK-001");
    assert.equal(created.value.task.currentRole, "executor");
    const filePath = join(
      value.projectRoot,
      ".personal-workspace",
      "tasks",
      "TASK-001.md",
    );
    const source = await readFile(filePath, "utf8");
    await writeFile(
      filePath,
      source.replace(
        "title: Implement task facts",
        "title: Implement task facts\ncustom_unknown: preserve-me",
      ),
    );
    const page = await tasks.getTasks(value.projectKey);
    assert.equal(page.ok, true);
    if (!page.ok) throw new Error(page.error.message);
    const current = page.value.tasks[0];
    if (current === undefined) throw new Error("Task snapshot missing.");
    const updated = await tasks.update({
      projectKey: value.projectKey,
      taskId: "TASK-001",
      revision: current.revision,
      hash: current.hash,
      patch: { title: "Edited task fact", currentRole: "reviewer" },
    });
    assert.equal(updated.ok, true);
    assert.match(
      await readFile(filePath, "utf8"),
      /custom_unknown: preserve-me/,
    );
    if (updated.ok) assert.equal(updated.value.task.currentRole, "reviewer");
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("task dependencies reject missing references and cycles, and stale revisions cannot overwrite", async () => {
  const value = await fixture();
  try {
    const tasks = service(value);
    const missing = await tasks.create(
      taskPayload(value.projectKey, { dependencies: ["TASK-999"] }),
    );
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.error.code, "invalid_dependency");
    const first = await tasks.create(taskPayload(value.projectKey));
    assert.equal(first.ok, true);
    const second = await tasks.create(
      taskPayload(value.projectKey, {
        title: "Second task",
        dependencies: ["TASK-001"],
      }),
    );
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) throw new Error("Task setup failed.");
    const cycle = await tasks.update({
      projectKey: value.projectKey,
      taskId: "TASK-001",
      revision: first.value.revision,
      hash: first.value.hash,
      patch: { dependencies: ["TASK-002"] },
    });
    assert.equal(cycle.ok, false);
    if (!cycle.ok) assert.equal(cycle.error.code, "circular_dependency");
    const stale = await tasks.update({
      projectKey: value.projectKey,
      taskId: "TASK-001",
      revision: 1,
      hash: "stale",
      patch: { title: "Must not overwrite" },
    });
    assert.equal(stale.ok, false);
    if (!stale.ok) assert.equal(stale.error.code, "revision_mismatch");
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});
