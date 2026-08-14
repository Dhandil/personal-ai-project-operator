import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";
import { GovernanceRepository } from "../src/infrastructure/files/governance-repository.js";
import { ProjectRegistryRepository } from "../src/infrastructure/registry/project-registry-repository.js";
import { ApprovalService } from "../src/infrastructure/approvals/approval-service.js";
import { RecoveryService } from "../src/infrastructure/recovery/recovery-service.js";

const timestamp = parseUtcIsoTimestamp("2026-08-14T08:00:00Z");

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-approval-recovery-"));
  const projectRoot = join(root, "project");
  const databasePath = join(root, "app.db");
  const registryDirectory = join(root, "registry");
  const registry = new ProjectRegistryRepository({
    databasePath,
    registryDirectory,
  });
  const registered = await registry.register({
    rootPath: projectRoot,
    name: "Recovery fixture",
    registeredAt: timestamp,
  });
  registry.close();
  assert.equal(registered.ok, true);
  if (!registered.ok) throw new Error(registered.error.message);
  const repository = new GovernanceRepository(projectRoot);
  await repository.write(
    ".personal-workspace/project.md",
    {
      frontMatter: {
        schema_version: 1,
        document_type: "project",
        revision: 1,
        created_at: timestamp,
        updated_at: timestamp,
        name: "Recovery fixture",
        idea: "Test recovery",
      },
      body: "# Recovery fixture\n",
    },
    null,
  );
  await repository.write(
    ".personal-workspace/goals/GOAL-001.md",
    {
      frontMatter: {
        schema_version: 1,
        document_type: "goal",
        revision: 1,
        created_at: timestamp,
        updated_at: timestamp,
        id: "GOAL-001",
        title: "Target",
        status: "ready",
      },
      body: "# Target\n",
    },
    null,
  );
  await repository.write(
    ".personal-workspace/status.md",
    {
      frontMatter: {
        schema_version: 1,
        document_type: "status_snapshot",
        revision: 1,
        generated_at: timestamp,
        updated_at: timestamp,
        source: "domain_facts",
      },
      body: "# Old status\n",
    },
    null,
  );
  return {
    root,
    projectRoot,
    projectKey: registered.value.projectKey,
    databasePath,
    registryDirectory,
  };
}

test("approval records capture a subject snapshot and expire after subject changes", async () => {
  const value = await fixture();
  try {
    const service = new ApprovalService({
      now: () => timestamp,
      registryFactory: () =>
        new ProjectRegistryRepository({
          databasePath: value.databasePath,
          registryDirectory: value.registryDirectory,
        }),
    });
    const requested = await service.request({
      projectKey: value.projectKey,
      approvalType: "short_term_goal_start",
      subjectId: "GOAL-001",
      request: "Start target",
    });
    assert.equal(requested.ok, true);
    if (!requested.ok) throw new Error(requested.error.message);
    assert.equal(requested.value.subjectSnapshot.revision, 1);
    const updated = await new GovernanceRepository(value.projectRoot).write(
      ".personal-workspace/goals/GOAL-001.md",
      {
        frontMatter: {
          schema_version: 1,
          document_type: "goal",
          revision: 2,
          created_at: timestamp,
          updated_at: timestamp,
          id: "GOAL-001",
          title: "Changed target",
          status: "ready",
        },
        body: "# Changed target\n",
      },
      { revision: 1, hash: requested.value.currentSnapshot?.hash ?? "" },
    );
    assert.equal(updated.ok, true);
    const decision = await service.decide({
      projectKey: value.projectKey,
      approvalId: "APPROVAL-001",
      outcome: "approved",
      note: "Proceed",
    });
    assert.equal(decision.ok, false);
    if (decision.ok) throw new Error("stale approval unexpectedly authorized");
    assert.equal(decision.error.code, "expired_approval");
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("recovery rebuilds the registry and generated status without chat history", async () => {
  const value = await fixture();
  try {
    await rm(value.databasePath, { force: true });
    await rm(join(value.projectRoot, ".personal-workspace", "status.md"), {
      force: true,
    });
    const service = new RecoveryService({
      now: () => timestamp,
      registryFactory: () =>
        new ProjectRegistryRepository({
          databasePath: value.databasePath,
          registryDirectory: value.registryDirectory,
        }),
    });
    const recovered = await service.recover({ projectKey: value.projectKey });
    assert.equal(recovered.ok, true);
    if (!recovered.ok) throw new Error(recovered.error.message);
    assert.equal(recovered.value.registryRebuilt, true);
    assert.equal(recovered.value.statusRebuilt, true);
    assert.match(
      await readFile(
        join(value.projectRoot, ".personal-workspace", "status.md"),
        "utf8",
      ),
      /domain_facts/,
    );
    const history = await service.history(value.projectKey);
    assert.equal(history.ok, true);
    if (!history.ok) throw new Error(history.error.message);
    assert.equal(
      history.value.entries.some(
        (entry) => entry.kind === "generated_snapshot",
      ),
      true,
    );
    assert.equal(
      history.value.entries.some((entry) => entry.kind === "audit_event"),
      true,
    );
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});
