import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";

import {
  ExternalConflictCoordinator,
  type ConflictWriteRequest,
} from "../src/infrastructure/conflicts/external-conflict.js";
import { FileSystemChangeWatcher } from "../src/infrastructure/conflicts/external-change-watcher.js";
import { AuditLogRepository } from "../src/infrastructure/audit/audit-log-repository.js";
import type { GovernanceDocument } from "../src/infrastructure/files/governance-codec.js";
import { GovernanceRepository } from "../src/infrastructure/files/governance-repository.js";
import { ProjectWriteQueue } from "../src/infrastructure/files/project-write-queue.js";

const timestamp = parseUtcIsoTimestamp("2026-08-14T06:00:00Z");
const relativePath = ".personal-workspace/tasks/TASK-014.md";

const initialDocument: GovernanceDocument = {
  frontMatter: {
    schema_version: 1,
    id: "TASK-014",
    status: "ready",
    revision: 1,
    created_at: timestamp,
    updated_at: timestamp,
  },
  body: "# Initial task\n",
};

const localDocument: GovernanceDocument = {
  ...initialDocument,
  frontMatter: {
    ...initialDocument.frontMatter,
    revision: 2,
    status: "in_progress",
  },
  body: "# Local pending change\n",
};

const externalDocument =
  "---\nschema_version: 1\nid: TASK-014\nstatus: ready\nrevision: 1\ncreated_at: 2026-08-14T06:00:00Z\nupdated_at: 2026-08-14T06:01:00Z\n---\n\n# External change\n";

async function createFixture(): Promise<
  Readonly<{
    readonly directory: string;
    readonly queue: ProjectWriteQueue;
    readonly repository: GovernanceRepository;
    readonly coordinator: ExternalConflictCoordinator;
  }>
> {
  const directory = await mkdtemp(join(tmpdir(), "personal-ai-conflict-"));
  const queue = new ProjectWriteQueue();
  const repository = new GovernanceRepository(directory, queue);
  const coordinator = new ExternalConflictCoordinator(directory, queue);
  return { directory, queue, repository, coordinator };
}

async function createConflictFixture(): Promise<
  Readonly<{
    readonly directory: string;
    readonly coordinator: ExternalConflictCoordinator;
    readonly request: ConflictWriteRequest;
    readonly path: string;
  }>
> {
  const { directory, repository, coordinator } = await createFixture();
  const created = await repository.write(relativePath, initialDocument, null);
  if (!created.ok) {
    throw new Error(created.error.message);
  }
  const path = join(directory, relativePath);
  await writeFile(path, externalDocument, "utf8");
  return {
    directory,
    coordinator,
    path,
    request: {
      relativePath,
      document: localDocument,
      expected: created.value.version,
      conflictId: "EXEC-014",
      relatedObjectIds: ["TASK-014"],
      detectedAt: timestamp,
    },
  };
}

test("external conflict stops the write, returns choices, and records reload result", async () => {
  const { directory, coordinator, request, path } =
    await createConflictFixture();
  try {
    const before = await readFile(path, "utf8");
    const attempt = await coordinator.write(request);
    assert.equal(attempt.ok, true);
    if (!attempt.ok || attempt.value.kind !== "conflict") {
      throw new Error("Expected a write conflict.");
    }
    assert.deepEqual(attempt.value.conflict.choices, [
      "reload_external",
      "keep_local",
      "cancel",
    ]);
    assert.equal(attempt.value.conflict.actual?.revision, 1);
    assert.equal(await readFile(path, "utf8"), before);

    const resolved = await coordinator.resolve(
      attempt.value.conflict,
      "reload_external",
      timestamp,
    );
    assert.equal(resolved.ok, true);
    if (!resolved.ok) {
      throw new Error(resolved.error.message);
    }
    assert.equal(resolved.value.choice, "reload_external");
    assert.equal(resolved.value.outcome, "external_reloaded");
    assert.match(
      resolved.value.externalSnapshot?.document.body ?? "",
      /External change/,
    );

    const audit = await new AuditLogRepository(directory).readAll();
    assert.equal(audit.ok, true);
    if (!audit.ok) {
      throw new Error(audit.error.message);
    }
    assert.equal(audit.value.length, 1);
    assert.equal(audit.value[0]?.type, "recovery");
    assert.equal(audit.value[0]?.details.choice, "reload_external");
    assert.equal(audit.value[0]?.details.outcome, "external_reloaded");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("conflict resolution can preserve local work or cancel without overwriting external files", async () => {
  const first = await createConflictFixture();
  try {
    const attempt = await first.coordinator.write(first.request);
    assert.equal(attempt.ok, true);
    if (!attempt.ok || attempt.value.kind !== "conflict") {
      throw new Error("Expected a write conflict.");
    }
    const resolved = await first.coordinator.resolve(
      { ...attempt.value.conflict, conflictId: "EXEC-015" },
      "keep_local",
      timestamp,
    );
    assert.equal(resolved.ok, true);
    if (!resolved.ok) {
      throw new Error(resolved.error.message);
    }
    assert.equal(resolved.value.outcome, "local_preserved");
    assert.equal(resolved.value.localDocument?.body, localDocument.body);
    assert.match(await readFile(first.path, "utf8"), /External change/);
  } finally {
    await rm(first.directory, { recursive: true, force: true });
  }

  const second = await createConflictFixture();
  try {
    const attempt = await second.coordinator.write({
      ...second.request,
      conflictId: "EXEC-016",
    });
    assert.equal(attempt.ok, true);
    if (!attempt.ok || attempt.value.kind !== "conflict") {
      throw new Error("Expected a write conflict.");
    }
    const resolved = await second.coordinator.resolve(
      attempt.value.conflict,
      "cancel",
      timestamp,
    );
    assert.equal(resolved.ok, true);
    if (!resolved.ok) {
      throw new Error(resolved.error.message);
    }
    assert.equal(resolved.value.outcome, "cancelled");
    assert.equal(resolved.value.externalSnapshot, null);
    assert.match(await readFile(second.path, "utf8"), /External change/);
  } finally {
    await rm(second.directory, { recursive: true, force: true });
  }
});

test("file watcher reports external changes and rejects paths outside the project", async () => {
  const directory = await mkdtemp(join(tmpdir(), "personal-ai-watcher-"));
  const watchedPath = join(directory, relativePath);
  try {
    const repository = new GovernanceRepository(
      directory,
      new ProjectWriteQueue(),
    );
    const created = await repository.write(relativePath, initialDocument, null);
    assert.equal(created.ok, true);

    const watcher = new FileSystemChangeWatcher(directory);
    const invalid = watcher.watch(["../outside.md"], () => undefined);
    assert.equal(invalid.ok, false);
    if (!invalid.ok) {
      assert.equal(invalid.error.code, "invalid_path");
    }

    let closeWatcher: (() => void) | undefined;
    const change = new Promise<Readonly<{ readonly kind: string }>>(
      (resolveChange, reject) => {
        const timer = setTimeout(() => {
          closeWatcher?.();
          reject(new Error("Timed out waiting for external change."));
        }, 2000);
        const started = watcher.watch([relativePath], (event) => {
          clearTimeout(timer);
          closeWatcher?.();
          resolveChange(event);
        });
        if (!started.ok) {
          clearTimeout(timer);
          reject(new Error(started.error.message));
        } else {
          closeWatcher = started.value.close;
        }
      },
    );
    await writeFile(watchedPath, externalDocument, "utf8");
    const observed = await change;
    assert.ok(["changed", "deleted", "created"].includes(observed.kind));
  } finally {
    await unlink(watchedPath).catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
});
