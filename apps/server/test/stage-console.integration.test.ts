import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";

import { buildApp } from "../src/app.js";
import { GovernanceRepository } from "../src/infrastructure/files/governance-repository.js";
import { ProjectRegistryRepository } from "../src/infrastructure/registry/project-registry-repository.js";
import { StageCoordinatorService } from "../src/infrastructure/stages/stage-coordinator.js";

const timestamp = parseUtcIsoTimestamp("2026-08-17T00:00:00Z");

test("planning console exposes persistent stage state through the API", async () => {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-stage-console-"));
  const projectRoot = join(root, "project");
  const databasePath = join(root, "app.db");
  const registryDirectory = join(root, "registry");
  await mkdir(projectRoot, { recursive: true });
  const repository = new GovernanceRepository(projectRoot);
  const project = await repository.write(
    ".personal-workspace/project.md",
    {
      frontMatter: {
        schema_version: 1,
        document_type: "project",
        revision: 1,
        created_at: timestamp,
        updated_at: timestamp,
        name: "Stage console fixture",
        idea: "A governed planning console.",
      },
      body: "# Stage console fixture\n",
    },
    null,
  );
  assert.equal(project.ok, true);
  const registry = new ProjectRegistryRepository({
    databasePath,
    registryDirectory,
  });
  const registered = await registry.register({
    rootPath: projectRoot,
    name: "Stage console fixture",
    registeredAt: timestamp,
  });
  registry.close();
  assert.equal(registered.ok, true);
  if (!registered.ok) throw new Error(registered.error.message);

  const coordinator = new StageCoordinatorService({
    now: () => timestamp,
    registryFactory: () =>
      new ProjectRegistryRepository({ databasePath, registryDirectory }),
  });
  const app = buildApp({ stageCoordinatorService: coordinator });
  try {
    const response = await app.inject({
      method: "GET",
      url: `/api/projects/stages?projectKey=${registered.value.projectKey}`,
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().value.runs, []);
    assert.equal(response.json().value.active, false);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
