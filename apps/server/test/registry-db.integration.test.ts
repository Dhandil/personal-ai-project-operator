import { strict as assert } from "node:assert";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";

import { ProjectRegistryRepository } from "../src/infrastructure/registry/project-registry-repository.js";

const registeredAt = parseUtcIsoTimestamp("2026-08-14T07:00:00Z");

async function createRepository(): Promise<
  Readonly<{
    readonly root: string;
    readonly databasePath: string;
    readonly registryDirectory: string;
    readonly repository: ProjectRegistryRepository;
  }>
> {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-registry-"));
  const databasePath = join(root, "app.db");
  const registryDirectory = join(root, "registry");
  return {
    root,
    databasePath,
    registryDirectory,
    repository: new ProjectRegistryRepository({
      databasePath,
      registryDirectory,
    }),
  };
}

test("registry database migrates idempotently and stores only index, settings, and cache", async () => {
  const fixture = await createRepository();
  try {
    const first = await fixture.repository.list();
    assert.equal(first.ok, true);
    if (!first.ok) {
      throw new Error(first.error.message);
    }
    assert.deepEqual(first.value, []);

    const registered = await fixture.repository.register({
      rootPath: join(fixture.root, "project-b"),
      name: "Project B",
      registeredAt,
    });
    assert.equal(registered.ok, true);
    const second = await fixture.repository.register({
      rootPath: join(fixture.root, "project-a"),
      name: "Project A",
      registeredAt,
    });
    assert.equal(second.ok, true);
    if (!registered.ok || !second.ok) {
      throw new Error("Registration fixture setup failed.");
    }

    assert.equal(fixture.repository.setSetting("ui.theme", "light").ok, true);
    assert.equal(
      fixture.repository.setCache(registered.value.projectKey, "status", {
        snapshotHash: "a".repeat(64),
        snapshotRevision: 2,
        refreshedAt: registeredAt,
      }).ok,
      true,
    );
    const setting = fixture.repository.getSetting("ui.theme");
    assert.deepEqual(setting, { ok: true, value: "light" });

    const database = new DatabaseSync(fixture.databasePath);
    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all() as readonly { name: string }[];
    database.close();
    assert.deepEqual(
      tables.map((table) => table.name),
      ["project_cache", "projects", "schema_migrations", "settings"],
    );
    assert.equal(
      tables.some((table) =>
        ["tasks", "progress", "decisions"].includes(table.name),
      ),
      false,
    );
  } finally {
    fixture.repository.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("deleting the database rebuilds the project index from the registration directory", async () => {
  const fixture = await createRepository();
  try {
    const first = await fixture.repository.register({
      rootPath: join(fixture.root, "project-a"),
      name: "Project A",
      registeredAt,
    });
    const second = await fixture.repository.register({
      rootPath: join(fixture.root, "project-b"),
      name: "Project B",
      registeredAt,
    });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    fixture.repository.close();
    await unlink(fixture.databasePath);

    const rebuiltRepository = new ProjectRegistryRepository({
      databasePath: fixture.databasePath,
      registryDirectory: fixture.registryDirectory,
    });
    try {
      const beforeRebuild = rebuiltRepository.list();
      assert.deepEqual(beforeRebuild, { ok: true, value: [] });
      const rebuilt = await rebuiltRepository.rebuildFromRegistry();
      assert.equal(rebuilt.ok, true);
      if (!rebuilt.ok) {
        throw new Error(rebuilt.error.message);
      }
      assert.deepEqual(
        rebuilt.value.map((record) => record.name),
        ["Project A", "Project B"],
      );

      const markers = await readdir(fixture.registryDirectory);
      assert.equal(markers.length, 2);
      const listed = rebuiltRepository.list();
      assert.equal(listed.ok, true);
      if (!listed.ok) {
        throw new Error(listed.error.message);
      }
      assert.equal(listed.value.length, 2);
    } finally {
      rebuiltRepository.close();
    }
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("rebuilding the index removes stale rows and rejects malformed registration markers", async () => {
  const fixture = await createRepository();
  try {
    const registered = await fixture.repository.register({
      rootPath: join(fixture.root, "project-a"),
      name: "Project A",
      registeredAt,
    });
    assert.equal(registered.ok, true);
    fixture.repository.close();

    const markers = await readdir(fixture.registryDirectory);
    assert.equal(markers.length, 1);
    await writeFile(
      join(fixture.registryDirectory, "broken.json"),
      "{}\n",
      "utf8",
    );
    const rebuiltRepository = new ProjectRegistryRepository({
      databasePath: fixture.databasePath,
      registryDirectory: fixture.registryDirectory,
    });
    try {
      const invalid = await rebuiltRepository.rebuildFromRegistry();
      assert.equal(invalid.ok, false);
      if (!invalid.ok) {
        assert.equal(invalid.error.code, "invalid_marker");
      }
      await unlink(join(fixture.registryDirectory, "broken.json"));
      const valid = await rebuiltRepository.rebuildFromRegistry();
      assert.equal(valid.ok, true);
    } finally {
      rebuiltRepository.close();
    }
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
