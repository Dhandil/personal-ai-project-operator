import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  baselineCommitSubject,
  baselineCommitTask,
  GitBootstrapService,
} from "../src/infrastructure/git/git-bootstrap.js";
import { GitProcess } from "../src/infrastructure/git/git-process.js";

async function createProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-git-"));
  await mkdir(join(root, ".personal-workspace"));
  await writeFile(
    join(root, ".personal-workspace", "project.md"),
    "---\nschema_version: 1\nrevision: 1\n---\n\n# Project\n",
    "utf8",
  );
  return root;
}

test("git detection distinguishes no repository, initialized repository, and invalid repository", async () => {
  const root = await createProject();
  const service = new GitBootstrapService();
  try {
    const absent = await service.detect(root);
    assert.equal(absent.ok, true);
    if (!absent.ok) {
      throw new Error(absent.error.message);
    }
    assert.equal(absent.value.state, "no_repository");

    await mkdir(join(root, ".git"));
    const invalid = await service.detect(root);
    assert.equal(invalid.ok, true);
    if (!invalid.ok) {
      throw new Error(invalid.error.message);
    }
    assert.equal(invalid.value.state, "invalid_repository");
    await rm(join(root, ".git"), { recursive: true, force: true });

    const bootstrapped = await service.bootstrap({
      projectRoot: root,
      approval: { approved: true, approvalId: "APPROVAL-001" },
    });
    assert.equal(bootstrapped.ok, true);
    const existing = await service.detect(root);
    assert.equal(existing.ok, true);
    if (!existing.ok) {
      throw new Error(existing.error.message);
    }
    assert.equal(existing.value.state, "existing_repository");
    assert.equal(existing.value.branch, "main");
    assert.equal(existing.value.head !== null, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("unapproved bootstrap performs no write and approved bootstrap creates a governed baseline commit", async () => {
  const root = await createProject();
  const service = new GitBootstrapService();
  try {
    const rejected = await service.bootstrap({
      projectRoot: root,
      approval: { approved: false, approvalId: "APPROVAL-001" },
    });
    assert.equal(rejected.ok, true);
    if (!rejected.ok) {
      throw new Error(rejected.error.message);
    }
    assert.equal(rejected.value.kind, "not_approved");
    assert.equal(rejected.value.detection.state, "no_repository");
    const noGit = await service.detect(root);
    assert.equal(noGit.ok, true);
    if (!noGit.ok) {
      throw new Error(noGit.error.message);
    }
    assert.equal(noGit.value.state, "no_repository");

    const approved = await service.bootstrap({
      projectRoot: root,
      approval: { approved: true, approvalId: "APPROVAL-001" },
    });
    assert.equal(approved.ok, true);
    if (!approved.ok) {
      throw new Error(approved.error.message);
    }
    assert.equal(approved.value.kind, "initialized");
    assert.equal(approved.value.commit?.subject, baselineCommitSubject);
    assert.equal(approved.value.commit?.body, baselineCommitTask);

    const log = await new GitProcess().run(
      ["log", "-1", "--pretty=format:%s%n%b"],
      root,
    );
    assert.equal(log.exitCode, 0);
    assert.equal(log.stdout.includes(baselineCommitSubject), true);
    assert.equal(log.stdout.includes(baselineCommitTask), true);
    assert.match(
      await readFile(join(root, ".personal-workspace", "project.md"), "utf8"),
      /# Project/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("repeated bootstrap does not rewrite an existing Git history", async () => {
  const root = await createProject();
  const service = new GitBootstrapService();
  try {
    const first = await service.bootstrap({
      projectRoot: root,
      approval: { approved: true, approvalId: "APPROVAL-001" },
    });
    assert.equal(first.ok, true);
    const before = await new GitProcess().run(["rev-parse", "HEAD"], root);
    assert.equal(before.exitCode, 0);

    const second = await service.bootstrap({
      projectRoot: root,
      approval: { approved: true, approvalId: "APPROVAL-001" },
    });
    assert.equal(second.ok, true);
    if (!second.ok) {
      throw new Error(second.error.message);
    }
    assert.equal(second.value.kind, "already_initialized");
    assert.equal(second.value.commit, null);

    const after = await new GitProcess().run(["rev-parse", "HEAD"], root);
    assert.equal(after.stdout.trim(), before.stdout.trim());
    const history = await new GitProcess().run(
      ["rev-list", "--count", "HEAD"],
      root,
    );
    assert.equal(history.stdout.trim(), "1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
