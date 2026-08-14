import { strict as assert } from "node:assert";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { AuditLogRepository } from "../src/infrastructure/audit/audit-log-repository.js";
import {
  evaluateGitBoundary,
  GitChangeBoundaryService,
} from "../src/infrastructure/git/git-change-boundary.js";
import { GitProcess } from "../src/infrastructure/git/git-process.js";

async function runGit(
  git: GitProcess,
  root: string,
  args: readonly string[],
): Promise<void> {
  const result = await git.run(args, root);
  assert.equal(
    result.exitCode,
    0,
    `${args.join(" ")} failed: ${result.stderr}`,
  );
}

async function createRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-change-boundary-"));
  const git = new GitProcess();
  await runGit(git, root, ["init", "--initial-branch=main"]);
  await runGit(git, root, ["config", "user.name", "Test User"]);
  await runGit(git, root, ["config", "user.email", "test@example.com"]);
  await mkdir(join(root, "allowed"));
  await writeFile(join(root, "allowed", "modified.txt"), "initial\n", {
    encoding: "utf8",
    flag: "w",
  });
  await writeFile(join(root, "allowed", "renamed.txt"), "rename\n", {
    encoding: "utf8",
    flag: "w",
  });
  await writeFile(join(root, "allowed", "deleted.txt"), "delete\n", {
    encoding: "utf8",
    flag: "w",
  });
  await writeFile(join(root, "outside.txt"), "outside\n", {
    encoding: "utf8",
    flag: "w",
  });
  await runGit(git, root, ["add", "--", "."]);
  await runGit(git, root, ["commit", "-m", "initial"]);
  return root;
}

test("Git change boundary reports tracked, untracked, renamed, deleted, and forbidden changes", async () => {
  const root = await createRepository();
  const git = new GitProcess();
  const service = new GitChangeBoundaryService(git);
  try {
    const before = await service.capture(root);
    assert.equal(before.ok, true);
    if (!before.ok) throw new Error(before.error.message);

    await writeFile(join(root, "allowed", "modified.txt"), "changed\n", "utf8");
    await writeFile(join(root, "allowed", "new.txt"), "new\n", "utf8");
    await runGit(git, root, ["mv", "allowed/renamed.txt", "allowed/moved.txt"]);
    await unlink(join(root, "allowed", "deleted.txt"));
    await writeFile(join(root, "outside.txt"), "outside changed\n", "utf8");

    const result = await service.validate(
      before.value,
      {
        allowedPaths: ["ALLOWED"],
        forbiddenPaths: ["outside.txt"],
      },
      [],
      {
        executionId: "EXEC-001",
        occurredAt: "2026-08-14T14:24:47Z",
        relatedObjectIds: [],
      },
    );
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error(result.error.message);
    assert.equal(result.value.passed, false);
    assert.deepEqual(
      new Set(result.value.changes.map((entry) => entry.kind)),
      new Set(["modified", "untracked", "renamed", "deleted"]),
    );
    assert.equal(
      result.value.changes.some(
        (entry) =>
          entry.kind === "renamed" &&
          entry.path === "allowed/moved.txt" &&
          entry.previousPath === "allowed/renamed.txt",
      ),
      true,
    );
    assert.equal(
      result.value.violations.some(
        (violation) =>
          violation.code === "forbidden_path" &&
          violation.path === "outside.txt",
      ),
      true,
    );
    assert.equal(
      result.value.violations.some(
        (violation) => violation.code === "path_not_allowed",
      ),
      false,
    );
    assert.equal(
      await readFile(join(root, "outside.txt"), "utf8"),
      "outside changed\n",
    );
    const audit = await new AuditLogRepository(root).readAll();
    assert.equal(audit.ok, true);
    if (!audit.ok) throw new Error(audit.error.message);
    assert.equal(audit.value.length, 1);
    assert.equal(audit.value[0]?.type, "privilege_violation");
    assert.equal(audit.value[0]?.action, "git boundary validation failed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Git change boundary excludes baseline changes but catches later edits", async () => {
  const root = await createRepository();
  const service = new GitChangeBoundaryService();
  try {
    await writeFile(
      join(root, "allowed", "modified.txt"),
      "before capture\n",
      "utf8",
    );
    const before = await service.capture(root);
    assert.equal(before.ok, true);
    if (!before.ok) throw new Error(before.error.message);

    const unchanged = await service.validate(before.value, {
      allowedPaths: ["allowed"],
      forbiddenPaths: [],
    });
    assert.equal(unchanged.ok, true);
    if (!unchanged.ok) throw new Error(unchanged.error.message);
    assert.equal(unchanged.value.passed, true);
    assert.equal(unchanged.value.changes.length, 0);

    await writeFile(
      join(root, "allowed", "modified.txt"),
      "after capture\n",
      "utf8",
    );
    const changed = await service.validate(before.value, {
      allowedPaths: ["allowed"],
      forbiddenPaths: [],
    });
    assert.equal(changed.ok, true);
    if (!changed.ok) throw new Error(changed.error.message);
    assert.equal(changed.value.passed, true);
    assert.equal(changed.value.changes.length, 1);
    assert.equal(changed.value.changes[0]?.kind, "modified");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Git change boundary normalizes Windows paths and rejects traversal and forbidden actions", () => {
  const snapshot = {
    projectRoot: "C:/project",
    head: "same-head",
    branch: "goal/GOAL-007",
    entries: [],
  } as const;
  const report = evaluateGitBoundary({
    before: snapshot,
    after: {
      ...snapshot,
      entries: [
        {
          path: "src/File.ts",
          previousPath: null,
          kind: "modified",
          indexStatus: " ",
          worktreeStatus: "M",
          contentHash: "hash",
        },
        {
          path: "../escape.txt",
          previousPath: null,
          kind: "untracked",
          indexStatus: "?",
          worktreeStatus: "?",
          contentHash: null,
        },
      ],
    },
    policy: {
      allowedPaths: ["SRC"],
      forbiddenPaths: [],
    },
    actions: ["force_push"],
  });
  assert.equal(report.passed, false);
  assert.equal(
    report.violations.some((violation) => violation.code === "invalid_path"),
    true,
  );
  assert.equal(
    report.violations.some(
      (violation) => violation.code === "forbidden_action",
    ),
    true,
  );
  assert.equal(
    report.violations.some(
      (violation) =>
        violation.path === "src/File.ts" &&
        violation.code === "path_not_allowed",
    ),
    false,
  );
});
