import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";

import { buildApp } from "../src/app.js";
import { IssueService } from "../src/infrastructure/issues/issue-service.js";
import { ProjectRegistryRepository } from "../src/infrastructure/registry/project-registry-repository.js";

const timestamp = parseUtcIsoTimestamp("2026-08-14T09:30:00Z");

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-issue-"));
  const projectRoot = join(root, "project");
  await mkdir(join(projectRoot, ".personal-workspace", "tasks"), {
    recursive: true,
  });
  await writeFile(
    join(projectRoot, ".personal-workspace", "tasks", "TASK-001.md"),
    [
      "---",
      "schema_version: 1",
      "document_type: task",
      "revision: 1",
      "created_at: 2026-08-14T09:30:00Z",
      "updated_at: 2026-08-14T09:30:00Z",
      "id: TASK-001",
      "status: in_progress",
      "---",
      "",
      "# Task 001",
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
    name: "Issue fixture",
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

function service(value: Awaited<ReturnType<typeof fixture>>): IssueService {
  return new IssueService({
    now: () => timestamp,
    registryFactory: () =>
      new ProjectRegistryRepository({
        databasePath: value.databasePath,
        registryDirectory: value.registryDirectory,
      }),
  });
}

test("known issue impact pauses only the affected task and records the issue", async () => {
  const value = await fixture();
  try {
    const app = buildApp({ issueService: service(value) });
    const response = await app.inject({
      method: "POST",
      url: "/api/projects/issues",
      payload: {
        projectKey: value.projectKey,
        title: "Dependency unavailable",
        description: "The required local dependency is unavailable.",
        severity: "high",
        impact: "task",
        affectedTaskIds: ["TASK-001"],
        affectedObjectIds: [],
        discussion: ["Agent analysis recorded."],
        recoveryPlan: "Restore the dependency and rerun validation.",
      },
    });
    assert.equal(response.statusCode, 200, response.body);
    const payload = response.json();
    assert.deepEqual(payload.value.pausedTaskIds, ["TASK-001"]);
    assert.deepEqual(payload.value.missingTaskIds, []);
    assert.equal(payload.value.executionChainPaused, false);
    assert.equal(payload.value.issue.issue.status, "in_progress");
    assert.match(
      await readFile(
        join(value.projectRoot, ".personal-workspace", "tasks", "TASK-001.md"),
        "utf8",
      ),
      /status: paused/,
    );
    const issues = await app.inject({
      method: "GET",
      url: `/api/projects/issues?projectKey=${value.projectKey}`,
    });
    assert.equal(issues.statusCode, 200);
    assert.equal(issues.json().value.issues.length, 1);
    await app.close();
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("unknown impact pauses the current chain and preserves decision and recovery trace", async () => {
  const value = await fixture();
  try {
    const app = buildApp({ issueService: service(value) });
    const opened = await app.inject({
      method: "POST",
      url: "/api/projects/issues",
      payload: {
        projectKey: value.projectKey,
        title: "Scope is unclear",
        description: "The impact cannot be determined yet.",
        severity: "blocker",
        impact: "unknown",
        affectedTaskIds: [],
        affectedObjectIds: [],
        discussion: ["Agent analysis: inspect the boundary before resuming."],
        currentTaskId: "TASK-001",
      },
    });
    assert.equal(opened.statusCode, 200, opened.body);
    const issueId = opened.json().value.issue.issue.id;
    assert.equal(opened.json().value.executionChainPaused, true);
    const decision = await app.inject({
      method: "POST",
      url: "/api/projects/issues/decision",
      payload: {
        projectKey: value.projectKey,
        issueId,
        question: "What should happen next?",
        options: ["resume", "cancel"],
        selectedOption: "resume",
        rationale: "The dependency is now understood and safe to retry.",
      },
    });
    assert.equal(decision.statusCode, 200, decision.body);
    assert.equal(decision.json().value.decision.decision.status, "completed");
    assert.equal(
      decision.json().value.decision.decision.decision.selectedOption,
      "resume",
    );
    const recovered = await app.inject({
      method: "POST",
      url: "/api/projects/issues/recover",
      payload: {
        projectKey: value.projectKey,
        issueId,
        action: "resume",
        rationale: "Resume the paused task after user decision.",
      },
    });
    assert.equal(recovered.statusCode, 200, recovered.body);
    assert.deepEqual(recovered.json().value.pausedTaskIds, ["TASK-001"]);
    assert.equal(recovered.json().value.issue.issue.status, "completed");
    assert.match(
      await readFile(
        join(value.projectRoot, ".personal-workspace", "tasks", "TASK-001.md"),
        "utf8",
      ),
      /status: in_progress/,
    );
    const page = await app.inject({
      method: "GET",
      url: `/api/projects/issues?projectKey=${value.projectKey}`,
    });
    assert.equal(page.json().value.issues[0].issue.discussion.length, 1);
    assert.equal(page.json().value.decisions.length, 1);
    await app.close();
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});
