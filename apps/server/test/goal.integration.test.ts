import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";

import { buildApp } from "../src/app.js";
import { GoalService } from "../src/infrastructure/goals/goal-service.js";
import { ProjectRegistryRepository } from "../src/infrastructure/registry/project-registry-repository.js";

const timestamp = parseUtcIsoTimestamp("2026-08-14T08:00:00Z");

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-goal-"));
  const projectRoot = join(root, "project");
  const registry = new ProjectRegistryRepository({
    databasePath: join(root, "app.db"),
    registryDirectory: join(root, "registry"),
  });
  const registered = await registry.register({
    rootPath: projectRoot,
    name: "Goal fixture",
    registeredAt: timestamp,
  });
  registry.close();
  assert.equal(registered.ok, true);
  if (!registered.ok) throw new Error(registered.error.message);
  return {
    root,
    projectKey: registered.value.projectKey,
    projectRoot,
    databasePath: join(root, "app.db"),
    registryDirectory: join(root, "registry"),
  };
}

function service(value: Awaited<ReturnType<typeof fixture>>): GoalService {
  return new GoalService({
    now: () => timestamp,
    registryFactory: () =>
      new ProjectRegistryRepository({
        databasePath: value.databasePath,
        registryDirectory: value.registryDirectory,
      }),
  });
}

test("goal proposal is reviewable and does not write before approval", async () => {
  const value = await fixture();
  try {
    const app = buildApp({ goalService: service(value) });
    const response = await app.inject({
      method: "POST",
      url: "/api/projects/goals/propose",
      payload: {
        projectKey: value.projectKey,
        title: "Ship the first governed slice",
        boundary: ["domain", "web"],
        risks: ["scope drift"],
        acceptanceCriteria: ["approval is recorded"],
        taskDrafts: [{ title: "Draft the first task" }],
      },
    });
    assert.equal(response.statusCode, 200);
    const payload = response.json();
    assert.equal(payload.value.proposal.goal.status, "draft");
    assert.equal(payload.value.proposal.proposal, undefined);
    await assert.rejects(
      readFile(
        join(value.projectRoot, ".personal-workspace", "goals", "GOAL-001.md"),
      ),
    );
    await app.close();
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("approval persists edited boundary and acceptance without starting the goal", async () => {
  const value = await fixture();
  try {
    const app = buildApp({ goalService: service(value) });
    const proposal = await app.inject({
      method: "POST",
      url: "/api/projects/goals/propose",
      payload: {
        projectKey: value.projectKey,
        title: "Original title",
        boundary: ["original boundary"],
        risks: [],
        acceptanceCriteria: ["original criterion"],
      },
    });
    assert.equal(proposal.statusCode, 200, proposal.body);
    const draft = proposal.json().value.proposal;
    assert.equal(draft.goal.title, "Original title");
    const decisionPayload = {
      projectKey: value.projectKey,
      approved: true,
      goal: {
        ...draft.goal,
        title: "Edited title",
        boundary: ["fixed boundary"],
        acceptanceCriteria: ["fixed criterion"],
      },
      taskDrafts: [{ title: "Task draft" }],
    };
    const decision = await app.inject({
      method: "POST",
      url: "/api/projects/goals/decision",
      payload: decisionPayload,
    });
    assert.equal(decision.statusCode, 200, decision.body);
    const payload = decision.json();
    assert.equal(payload.value.goal.goal.status, "ready");
    assert.equal(payload.value.goal.goal.approval.approved, true);
    assert.deepEqual(payload.value.goal.goal.boundary, ["fixed boundary"]);
    assert.deepEqual(payload.value.goal.goal.acceptanceCriteria, [
      "fixed criterion",
    ]);
    const stored = await readFile(
      join(value.projectRoot, ".personal-workspace", "goals", "GOAL-001.md"),
      "utf8",
    );
    assert.match(stored, /status: ready/);
    assert.match(stored, /fixed boundary/);
    assert.match(stored, /fixed criterion/);
    await app.close();
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("rejection records a cancelled goal that is not executable", async () => {
  const value = await fixture();
  try {
    const app = buildApp({ goalService: service(value) });
    const response = await app.inject({
      method: "POST",
      url: "/api/projects/goals/decision",
      payload: {
        projectKey: value.projectKey,
        approved: false,
        goal: {
          title: "Rejected goal",
          boundary: ["review"],
          risks: [],
          acceptanceCriteria: ["decision recorded"],
        },
      },
    });
    assert.equal(response.statusCode, 200);
    const payload = response.json();
    assert.equal(payload.value.goal.goal.status, "cancelled");
    assert.equal(payload.value.goal.goal.approval.approved, false);
    assert.equal(payload.value.goal.goal.approval.decidedBy, "user");
    await app.close();
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});
