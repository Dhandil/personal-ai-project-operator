import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";

import { buildApp } from "../src/app.js";
import { GovernanceRepository } from "../src/infrastructure/files/governance-repository.js";
import { PlanningDraftService } from "../src/infrastructure/planning/planning-draft-service.js";
import { ProjectRegistryRepository } from "../src/infrastructure/registry/project-registry-repository.js";

const timestamp = parseUtcIsoTimestamp("2026-08-17T00:00:00Z");

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-planning-draft-"));
  const projectRoot = join(root, "project");
  const databasePath = join(root, "app.db");
  const registryDirectory = join(root, "registry");
  const registry = new ProjectRegistryRepository({
    databasePath,
    registryDirectory,
  });
  const registered = await registry.register({
    rootPath: projectRoot,
    name: "Planning draft fixture",
    registeredAt: timestamp,
  });
  registry.close();
  assert.equal(registered.ok, true);
  if (!registered.ok) throw new Error(registered.error.message);

  const repository = new GovernanceRepository(projectRoot);
  const spec = await repository.write(
    ".personal-workspace/stages/03-spec/03-spec.md",
    {
      frontMatter: {
        schema_version: 1,
        document_type: "stage_artifact",
        artifact_status: "approved",
        stage: "spec",
        stage_run_id: "STAGE-RUN-003",
        revision: 1,
        created_at: timestamp,
        updated_at: timestamp,
        payload: {
          schemaVersion: 1,
          kind: "spec_result",
          stage: "spec",
          requirements: ["Define the bounded workflow", "Verify the handoff"],
          constraints: ["No formal facts before user approval"],
          validationPlan: ["Run the planning draft tests"],
          artifactRefs: [],
          handoff: "Planning may propose implementation work.",
        },
      },
      body: "# Approved Spec\n\nPlanning input.\n",
    },
    null,
  );
  assert.equal(spec.ok, true);
  if (!spec.ok) throw new Error(spec.error.message);

  const service = new PlanningDraftService({
    now: () => timestamp,
    registryFactory: () =>
      new ProjectRegistryRepository({ databasePath, registryDirectory }),
  });
  return {
    root,
    projectRoot,
    projectKey: registered.value.projectKey,
    repository,
    service,
  };
}

test("generates editable planning drafts without writing formal facts", async () => {
  const value = await fixture();
  try {
    const generated = await value.service.generate({
      projectKey: value.projectKey,
    });
    assert.equal(generated.ok, true);
    if (!generated.ok) throw new Error(generated.error.message);
    assert.equal(generated.value.status, "candidate");
    assert.equal(generated.value.draft.taskDrafts.length, 2);
    assert.deepEqual(generated.value.draft.taskDrafts[0].dependencies, []);
    assert.deepEqual(generated.value.draft.taskDrafts[1].dependencies, [
      generated.value.draft.taskDrafts[0].id,
    ]);

    await assert.rejects(
      readFile(
        join(value.projectRoot, ".personal-workspace", "goals", "GOAL-001.md"),
      ),
    );
    const regenerated = await value.service.generate({
      projectKey: value.projectKey,
    });
    assert.equal(regenerated.ok, true);
    if (!regenerated.ok) throw new Error(regenerated.error.message);
    assert.equal(regenerated.value.hash, generated.value.hash);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("preserves edited draft metadata and approves only after the user decision", async () => {
  const value = await fixture();
  try {
    const generated = await value.service.generate({
      projectKey: value.projectKey,
    });
    assert.equal(generated.ok, true);
    if (!generated.ok) throw new Error(generated.error.message);

    const stored = await value.repository.read(
      ".personal-workspace/stages/03-spec/planning-draft.md",
    );
    assert.equal(stored.ok, true);
    if (!stored.ok) throw new Error(stored.error.message);
    const marked = await value.repository.write(
      ".personal-workspace/stages/03-spec/planning-draft.md",
      {
        ...stored.value.document,
        frontMatter: {
          ...stored.value.document.frontMatter,
          revision: stored.value.version.revision + 1,
          user_note: "keep this metadata",
        },
      },
      stored.value.version,
    );
    assert.equal(marked.ok, true);
    if (!marked.ok) throw new Error(marked.error.message);

    const edited = await value.service.edit({
      projectKey: value.projectKey,
      revision: marked.value.version.revision,
      hash: marked.value.version.hash,
      draft: {
        goalDrafts: [
          {
            ...generated.value.draft.goalDrafts[0],
            title: "User-edited generated goal",
          },
        ],
      },
    });
    assert.equal(edited.ok, true);
    if (!edited.ok) throw new Error(edited.error.message);
    assert.equal(
      edited.value.draft.goalDrafts[0].title,
      "User-edited generated goal",
    );

    const beforeApproval = await value.service.get({
      projectKey: value.projectKey,
    });
    assert.equal(beforeApproval.ok, true);
    if (!beforeApproval.ok || beforeApproval.value === null) {
      throw new Error("Expected an editable planning draft.");
    }
    assert.equal(beforeApproval.value.status, "candidate");
    const draftDocument = await value.repository.read(
      ".personal-workspace/stages/03-spec/planning-draft.md",
    );
    assert.equal(draftDocument.ok, true);
    if (draftDocument.ok)
      assert.equal(
        draftDocument.value.document.frontMatter.user_note,
        "keep this metadata",
      );

    const approved = await value.service.approve({
      projectKey: value.projectKey,
      revision: edited.value.revision,
      hash: edited.value.hash,
      note: "User approved the generated and edited plan.",
    });
    assert.equal(approved.ok, true);
    if (!approved.ok) throw new Error(approved.error.message);
    assert.equal(approved.value.readyTaskId, approved.value.taskIds[0]);
    assert.match(
      await readFile(
        join(
          value.projectRoot,
          ".personal-workspace",
          "tasks",
          `${approved.value.taskIds[0]}.md`,
        ),
        "utf8",
      ),
      /status: ready/,
    );
    assert.match(
      await readFile(
        join(
          value.projectRoot,
          ".personal-workspace",
          "tasks",
          `${approved.value.taskIds[1]}.md`,
        ),
        "utf8",
      ),
      /status: draft/,
    );
    const finalDraft = await value.service.get({
      projectKey: value.projectKey,
    });
    assert.equal(finalDraft.ok, true);
    if (finalDraft.ok && finalDraft.value !== null)
      assert.equal(finalDraft.value.status, "approved");
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("rejects stale approval and records rejection without formal writes", async () => {
  const value = await fixture();
  try {
    const generated = await value.service.generate({
      projectKey: value.projectKey,
    });
    assert.equal(generated.ok, true);
    if (!generated.ok) throw new Error(generated.error.message);
    const stale = await value.service.approve({
      projectKey: value.projectKey,
      revision: generated.value.revision - 1,
      hash: generated.value.hash,
      note: "stale approval must be rejected",
    });
    assert.equal(stale.ok, false);
    if (!stale.ok) assert.equal(stale.error.code, "revision_mismatch");

    const rejected = await value.service.reject({
      projectKey: value.projectKey,
      revision: generated.value.revision,
      hash: generated.value.hash,
      note: "The plan needs another user review.",
    });
    assert.equal(rejected.ok, true);
    if (!rejected.ok) throw new Error(rejected.error.message);
    assert.equal(rejected.value.status, "rejected");
    await assert.rejects(
      readFile(
        join(value.projectRoot, ".personal-workspace", "tasks", "TASK-001.md"),
      ),
    );
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("exposes planning draft generation through the server API", async () => {
  const value = await fixture();
  const app = buildApp({ planningDraftService: value.service });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/projects/planning-draft/generate",
      payload: { projectKey: value.projectKey },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().value.status, "candidate");

    const current = await app.inject({
      method: "GET",
      url: `/api/projects/planning-draft?projectKey=${value.projectKey}`,
    });
    assert.equal(current.statusCode, 200, current.body);
    assert.equal(current.json().value.draft.kind, "planning_draft");
  } finally {
    await app.close();
    await rm(value.root, { recursive: true, force: true });
  }
});
