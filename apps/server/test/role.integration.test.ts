import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";

import { buildApp } from "../src/app.js";
import { RoleService } from "../src/infrastructure/roles/role-service.js";
import { ProjectRegistryRepository } from "../src/infrastructure/registry/project-registry-repository.js";

const timestamp = parseUtcIsoTimestamp("2026-08-14T09:00:00Z");

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-role-"));
  const projectRoot = join(root, "project");
  await mkdir(join(projectRoot, ".personal-workspace", "tasks"), {
    recursive: true,
  });
  const registry = new ProjectRegistryRepository({
    databasePath: join(root, "app.db"),
    registryDirectory: join(root, "registry"),
  });
  const registered = await registry.register({
    rootPath: projectRoot,
    name: "Role fixture",
    registeredAt: timestamp,
  });
  registry.close();
  assert.equal(registered.ok, true);
  if (!registered.ok) throw new Error(registered.error.message);
  return {
    root,
    projectKey: registered.value.projectKey,
    databasePath: join(root, "app.db"),
    registryDirectory: join(root, "registry"),
    projectRoot,
  };
}

function service(value: Awaited<ReturnType<typeof fixture>>): RoleService {
  return new RoleService({
    registryFactory: () =>
      new ProjectRegistryRepository({
        databasePath: value.databasePath,
        registryDirectory: value.registryDirectory,
      }),
  });
}

test("roles expose five stable templates and explicit context availability", async () => {
  const value = await fixture();
  try {
    const app = buildApp({ roleService: service(value) });
    const response = await app.inject({
      method: "GET",
      url: `/api/projects/roles?projectKey=${value.projectKey}`,
    });
    assert.equal(response.statusCode, 200);
    const payload = response.json();
    assert.equal(payload.value.roles.length, 5);
    const executor = payload.value.roles.find(
      (item: { role: { key: string } }) => item.role.key === "executor",
    );
    assert.equal(executor.canModifyProjectFiles, true);
    assert.equal(
      executor.context.mustRead.find(
        (item: { name: string }) => item.name === "task card",
      ).state,
      "available",
    );
    const reviewer = payload.value.roles.find(
      (item: { role: { key: string } }) => item.role.key === "reviewer",
    );
    assert.equal(reviewer.canModifyProjectFiles, false);
    assert.equal(
      reviewer.role.forbiddenActions.includes("modify implementation"),
      true,
    );
    await app.close();
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("role editing persists project templates but rejects Agent bindings and unsafe reviewer permissions", async () => {
  const value = await fixture();
  try {
    const app = buildApp({ roleService: service(value) });
    const roles = await service(value).getRoles(value.projectKey);
    assert.equal(roles.ok, true);
    if (!roles.ok) throw new Error(roles.error.message);
    const executor = roles.value.roles.find(
      (item) => item.role.key === "executor",
    );
    const reviewer = roles.value.roles.find(
      (item) => item.role.key === "reviewer",
    );
    if (executor === undefined || reviewer === undefined)
      throw new Error("Role fixture incomplete.");
    const saved = await app.inject({
      method: "POST",
      url: "/api/projects/roles/update",
      payload: {
        projectKey: value.projectKey,
        role: { ...executor.role, title: "Local executor" },
      },
    });
    assert.equal(saved.statusCode, 200);
    assert.match(
      await readFile(
        join(value.projectRoot, ".personal-workspace", "roles", "executor.md"),
        "utf8",
      ),
      /Local executor/,
    );
    const agentBinding = await app.inject({
      method: "POST",
      url: "/api/projects/roles/update",
      payload: {
        projectKey: value.projectKey,
        role: { ...executor.role, agent: "agent-1" },
      },
    });
    assert.equal(agentBinding.statusCode, 400);
    assert.equal(agentBinding.json().error.code, "invalid_role");
    const unsafeReviewer = await app.inject({
      method: "POST",
      url: "/api/projects/roles/update",
      payload: {
        projectKey: value.projectKey,
        role: { ...reviewer.role, forbiddenActions: ["none"] },
      },
    });
    assert.equal(unsafeReviewer.statusCode, 400);
    assert.equal(unsafeReviewer.json().error.code, "invalid_role");
    await app.close();
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});
