import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  GovernanceRepository,
  type FileVersion,
} from "../src/infrastructure/files/governance-repository.js";
import { ProjectWriteQueue } from "../src/infrastructure/files/project-write-queue.js";
import type { GovernanceDocument } from "../src/infrastructure/files/governance-codec.js";

const initialDocument: GovernanceDocument = {
  frontMatter: {
    schema_version: 1,
    id: "TASK-011",
    status: "draft",
    revision: 1,
    created_at: "2026-08-14T00:00:00Z",
    updated_at: "2026-08-14T00:00:00Z",
    unknown_future_field: { keep: true },
  },
  body: "# Initial record\n",
};

function nextDocument(revision: number, body: string): GovernanceDocument {
  return {
    ...initialDocument,
    frontMatter: { ...initialDocument.frontMatter, revision },
    body,
  };
}

async function createRepository(): Promise<
  Readonly<{
    readonly directory: string;
    readonly repository: GovernanceRepository;
  }>
> {
  const directory = await mkdtemp(join(tmpdir(), "personal-ai-repository-"));
  const repository = new GovernanceRepository(
    directory,
    new ProjectWriteQueue(),
  );
  return { directory, repository };
}

test("governance-repository writes atomically and rejects revision/hash conflicts", async () => {
  const { directory, repository } = await createRepository();
  const relativePath = "tasks/TASK-011.md";

  try {
    const created = await repository.write(relativePath, initialDocument, null);
    assert.equal(created.ok, true);
    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const expected = created.value.version;
    const changedHash: FileVersion = { ...expected, hash: "0".repeat(64) };
    const hashConflict = await repository.write(
      relativePath,
      nextDocument(2, "# Should not overwrite\n"),
      changedHash,
    );
    assert.equal(hashConflict.ok, false);
    if (!hashConflict.ok) {
      assert.equal(hashConflict.error.code, "hash_mismatch");
    }

    const revisionConflict = await repository.write(
      relativePath,
      nextDocument(3, "# Should also not overwrite\n"),
      expected,
    );
    assert.equal(revisionConflict.ok, false);
    if (!revisionConflict.ok) {
      assert.equal(revisionConflict.error.code, "revision_mismatch");
    }

    const unchanged = await repository.read(relativePath);
    assert.equal(unchanged.ok, true);
    if (unchanged.ok) {
      assert.equal(unchanged.value.version.revision, 1);
      assert.equal(unchanged.value.document.body, initialDocument.body);
      assert.deepEqual(
        unchanged.value.document.frontMatter.unknown_future_field,
        { keep: true },
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("governance-repository serializes concurrent writes per project", async () => {
  const { directory, repository } = await createRepository();
  const relativePath = "tasks/TASK-011.md";

  try {
    const created = await repository.write(relativePath, initialDocument, null);
    assert.equal(created.ok, true);
    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const expected = created.value.version;
    const writes = await Promise.all([
      repository.write(
        relativePath,
        nextDocument(2, "# First writer\n"),
        expected,
      ),
      repository.write(
        relativePath,
        nextDocument(2, "# Second writer\n"),
        expected,
      ),
    ]);
    assert.equal(writes.filter((result) => result.ok).length, 1);
    assert.equal(
      writes.filter(
        (result) => !result.ok && result.error.code === "revision_mismatch",
      ).length,
      1,
    );

    const final = await repository.read(relativePath);
    assert.equal(final.ok, true);
    if (final.ok) {
      assert.equal(final.value.version.revision, 2);
      assert.match(final.value.document.body, /First|Second writer/);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("atomic writer failure does not change an existing target", async () => {
  const { directory, repository } = await createRepository();
  const relativePath = "tasks/TASK-011.md";
  const filePath = join(directory, relativePath);

  try {
    const created = await repository.write(relativePath, initialDocument, null);
    assert.equal(created.ok, true);
    const before = await readFile(filePath, "utf8");
    const conflict = await repository.write(
      relativePath,
      nextDocument(1, "# Invalid revision\n"),
      created.ok ? created.value.version : null,
    );
    assert.equal(conflict.ok, false);
    assert.equal(await readFile(filePath, "utf8"), before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
