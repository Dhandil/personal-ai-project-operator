import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { ProjectWriteQueue } from "../src/infrastructure/files/project-write-queue.js";
import {
  GitWorktreeService,
  goalBranchName,
  taskBranchName,
  taskWorktreePath,
  worktreeRoot,
} from "../src/infrastructure/git/git-worktree.js";
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

async function createRepository(): Promise<
  Readonly<{ root: string; runtime: string }>
> {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-git-worktree-"));
  const runtime = await mkdtemp(join(tmpdir(), "personal-ai-runtime-"));
  const git = new GitProcess();
  await runGit(git, root, ["init", "--initial-branch=main"]);
  await runGit(git, root, ["config", "user.name", "Test User"]);
  await runGit(git, root, ["config", "user.email", "test@example.com"]);
  await writeFile(join(root, "README.md"), "initial\n", "utf8");
  await runGit(git, root, ["add", "--", "README.md"]);
  await runGit(git, root, ["commit", "-m", "initial"]);
  return { root, runtime };
}

test("Git Worktree lifecycle creates stable goal/task isolation and recovers by query", async () => {
  const fixture = await createRepository();
  const git = new GitProcess();
  const service = new GitWorktreeService(
    git,
    undefined,
    new ProjectWriteQueue(),
  );
  try {
    const goal = await service.ensureGoalBranch({
      projectRoot: fixture.root,
      goalId: "GOAL-007",
      baseRef: "main",
    });
    assert.equal(goal.ok, true);
    if (!goal.ok) throw new Error(goal.error.message);
    assert.equal(goal.value.branch, goalBranchName("GOAL-007"));
    assert.equal(goal.value.created, true);

    const repeatedGoal = await service.ensureGoalBranch({
      projectRoot: fixture.root,
      goalId: "GOAL-007",
      baseRef: "main",
    });
    assert.equal(repeatedGoal.ok, true);
    if (!repeatedGoal.ok) throw new Error(repeatedGoal.error.message);
    assert.equal(repeatedGoal.value.created, false);
    assert.equal(repeatedGoal.value.head, goal.value.head);

    const request = {
      projectRoot: fixture.root,
      goalId: "GOAL-007",
      taskId: "TASK-032",
      runtimeDirectory: fixture.runtime,
      baseRef: "main",
    } as const;
    const created = await service.createTaskWorktree(request);
    assert.equal(created.ok, true);
    if (!created.ok) throw new Error(created.error.message);
    assert.equal(created.value.state, "created");
    assert.equal(created.value.record.goalBranch, goalBranchName("GOAL-007"));
    assert.equal(created.value.record.taskBranch, taskBranchName("TASK-032"));
    assert.equal(created.value.record.worktreePath, taskWorktreePath(request));
    assert.equal(
      created.value.record.worktreePath.startsWith(
        worktreeRoot(fixture.root, fixture.runtime),
      ),
      true,
    );

    const recovered = new GitWorktreeService(
      git,
      undefined,
      new ProjectWriteQueue(),
    );
    const inspected = await recovered.inspectTaskWorktree(request);
    assert.equal(inspected.ok, true);
    if (!inspected.ok) throw new Error(inspected.error.message);
    assert.equal(inspected.value?.taskBranch, taskBranchName("TASK-032"));
    assert.equal(inspected.value?.worktreePath, taskWorktreePath(request));

    const existing = await recovered.createTaskWorktree(request);
    assert.equal(existing.ok, true);
    if (!existing.ok) throw new Error(existing.error.message);
    assert.equal(existing.value.state, "existing");

    const retained = await recovered.cleanupTaskWorktree({
      ...request,
      retain: true,
    });
    assert.equal(retained.ok, true);
    if (!retained.ok) throw new Error(retained.error.message);
    assert.equal(retained.value.state, "retained");
    assert.equal((await recovered.inspectTaskWorktree(request)).ok, true);
  } finally {
    await rm(fixture.runtime, { recursive: true, force: true });
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("Git Worktree lifecycle serializes task creation and refuses dirty cleanup", async () => {
  const fixture = await createRepository();
  const git = new GitProcess();
  const service = new GitWorktreeService(
    git,
    undefined,
    new ProjectWriteQueue(),
  );
  const request = {
    projectRoot: fixture.root,
    goalId: "GOAL-007",
    taskId: "TASK-032",
    runtimeDirectory: fixture.runtime,
    baseRef: "main",
  } as const;
  try {
    const results = await Promise.all([
      service.createTaskWorktree(request),
      service.createTaskWorktree(request),
    ]);
    assert.equal(
      results.every((result) => result.ok),
      true,
    );
    const states = results.map((result) =>
      result.ok ? result.value.state : "error",
    );
    assert.equal(states.includes("created"), true);
    assert.equal(states.includes("existing"), true);

    const path = taskWorktreePath(request);
    await writeFile(join(path, "dirty.txt"), "uncommitted\n", "utf8");
    const refused = await service.cleanupTaskWorktree(request);
    assert.equal(refused.ok, false);
    if (refused.ok) throw new Error("dirty cleanup unexpectedly succeeded");
    assert.equal(refused.error.code, "dirty_worktree");
    assert.equal(
      await readFile(join(path, "dirty.txt"), "utf8"),
      "uncommitted\n",
    );

    await runGit(git, path, ["clean", "-fd"]);
    const removed = await service.cleanupTaskWorktree(request);
    assert.equal(removed.ok, true);
    if (!removed.ok) throw new Error(removed.error.message);
    assert.equal(removed.value.state, "removed");
    const after = await service.inspectTaskWorktree(request);
    assert.equal(after.ok, true);
    if (!after.ok) throw new Error(after.error.message);
    assert.equal(after.value, null);
    const branch = await git.run(
      ["show-ref", "--verify", "--quiet", "refs/heads/task/TASK-032"],
      fixture.root,
    );
    assert.equal(branch.exitCode, 0);
  } finally {
    await rm(fixture.runtime, { recursive: true, force: true });
    await rm(fixture.root, { recursive: true, force: true });
  }
});
