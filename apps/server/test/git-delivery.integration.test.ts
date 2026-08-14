import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createApproval, decideApproval } from "@personal-ai-operator/domain";

import {
  GitGoalMergeService,
  GitTaskDeliveryService,
  type MainMergeApproval,
} from "../src/infrastructure/git/git-delivery.js";
import { GitProcess } from "../src/infrastructure/git/git-process.js";
import { createTaskCommitMessage } from "../src/infrastructure/git/git-commit-message.js";

async function runGit(
  git: GitProcess,
  root: string,
  args: readonly string[],
): Promise<string> {
  const result = await git.run(args, root);
  assert.equal(
    result.exitCode,
    0,
    `${args.join(" ")} failed: ${result.stderr}`,
  );
  return result.stdout.trim();
}

async function createRepository(): Promise<
  Readonly<{ root: string; main: string }>
> {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-git-delivery-"));
  const git = new GitProcess();
  await runGit(git, root, ["init", "--initial-branch=main"]);
  await runGit(git, root, ["config", "user.name", "Test User"]);
  await runGit(git, root, ["config", "user.email", "test@example.com"]);
  await writeFile(join(root, "README.md"), "initial\n", "utf8");
  await runGit(git, root, ["add", "--", "README.md"]);
  await runGit(git, root, ["commit", "-m", "chore(test): initialize fixture"]);
  const main = await runGit(git, root, ["rev-parse", "HEAD"]);
  await runGit(git, root, ["branch", "goal/GOAL-007"]);
  await runGit(git, root, ["switch", "-c", "task/TASK-034", "goal/GOAL-007"]);
  return { root, main };
}

async function acceptedApproval(): Promise<MainMergeApproval> {
  const created = createApproval({
    id: "TASK-034",
    revision: 1,
    createdAt: "2026-08-14T14:00:00Z",
    updatedAt: "2026-08-14T14:00:00Z",
    relatedObjectIds: ["GOAL-007"],
    approvalType: "short_term_goal_acceptance_and_main_merge",
    subjectId: "GOAL-007",
    requestedBy: "agent",
    request: "Accept GOAL-007 and approve main merge.",
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error(created.error.message);
  const decided = decideApproval(created.value, {
    decidedBy: "user",
    outcome: "approved",
    decidedAt: "2026-08-14T14:01:00Z",
    note: "Approved after review.",
  });
  assert.equal(decided.ok, true);
  if (!decided.ok) throw new Error(decided.error.message);
  return {
    approvalId: "APPROVAL-001",
    operation: "main_merge",
    approval: decided.value,
    subjectSnapshot: { revision: 1, hash: "goal-fact-hash" },
    currentSnapshot: { revision: 1, hash: "goal-fact-hash" },
    stale: false,
  };
}

test("commit message formatter enforces the project format and task reference", () => {
  const formatted = createTaskCommitMessage({
    type: "feat",
    scope: "tasks",
    description: "实现规范交付",
    taskId: "TASK-034",
  });
  assert.equal(formatted.ok, true);
  if (!formatted.ok) throw new Error(formatted.error.message);
  assert.equal(formatted.value.subject, "feat(tasks): 实现规范交付");
  assert.equal(formatted.value.body, "Tasks: TASK-034");
  assert.equal(
    createTaskCommitMessage({
      type: "Feat",
      scope: "tasks",
      description: "invalid",
      taskId: "TASK-034",
    }).ok,
    false,
  );
});

test("unaccepted tasks cannot commit or merge into the goal branch", async () => {
  const fixture = await createRepository();
  const git = new GitProcess();
  const service = new GitTaskDeliveryService(git);
  try {
    await writeFile(join(fixture.root, "result.md"), "unaccepted\n", "utf8");
    const before = await runGit(git, fixture.root, ["rev-parse", "HEAD"]);
    const result = await service.deliverTask({
      projectRoot: fixture.root,
      goalId: "GOAL-007",
      taskId: "TASK-034",
      taskStatus: "in_review",
      accepted: false,
      allowedPaths: ["result.md"],
      forbiddenPaths: [".git"],
      commitType: "feat",
      commitScope: "tasks",
      commitDescription: "should not commit",
    });
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unaccepted task unexpectedly delivered");
    assert.equal(result.error.code, "not_accepted");
    assert.equal(
      await runGit(git, fixture.root, ["rev-parse", "HEAD"]),
      before,
    );
    assert.match(
      await readFile(join(fixture.root, "result.md"), "utf8"),
      /unaccepted/,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("accepted task commits with Tasks body and merges into the goal branch", async () => {
  const fixture = await createRepository();
  const git = new GitProcess();
  const service = new GitTaskDeliveryService(git);
  try {
    await writeFile(join(fixture.root, "result.md"), "accepted\n", "utf8");
    const delivered = await service.deliverTask({
      projectRoot: fixture.root,
      goalId: "GOAL-007",
      taskId: "TASK-034",
      taskStatus: "completed",
      accepted: true,
      allowedPaths: ["result.md"],
      forbiddenPaths: [".git"],
      commitType: "feat",
      commitScope: "git",
      commitDescription: "实现规范交付",
    });
    assert.equal(delivered.ok, true);
    if (!delivered.ok) throw new Error(delivered.error.message);
    assert.equal(delivered.value.task.branch, "task/TASK-034");
    assert.equal(delivered.value.goalBranch, "goal/GOAL-007");
    assert.notEqual(delivered.value.goalCommit, fixture.main);
    const log = await runGit(git, fixture.root, [
      "log",
      "-1",
      "--format=%s%n%b",
    ]);
    assert.match(log, /merge\(task\): 合并 TASK-034/);
    assert.match(log, /Tasks: TASK-034/);
    assert.equal(
      (await readFile(join(fixture.root, "result.md"), "utf8")).replaceAll(
        "\r\n",
        "\n",
      ),
      "accepted\n",
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("main merge requires a current user approval and creates a local merge commit", async () => {
  const fixture = await createRepository();
  const git = new GitProcess();
  const taskService = new GitTaskDeliveryService(git);
  const mergeService = new GitGoalMergeService(git);
  try {
    await writeFile(join(fixture.root, "result.md"), "accepted\n", "utf8");
    const delivered = await taskService.deliverTask({
      projectRoot: fixture.root,
      goalId: "GOAL-007",
      taskId: "TASK-034",
      taskStatus: "completed",
      accepted: true,
      allowedPaths: ["result.md"],
      forbiddenPaths: [".git"],
      commitType: "feat",
      commitScope: "git",
      commitDescription: "实现规范交付",
    });
    assert.equal(delivered.ok, true);
    if (!delivered.ok) throw new Error(delivered.error.message);
    const denied = await mergeService.mergeGoal({
      projectRoot: fixture.root,
      goalId: "GOAL-007",
    });
    assert.equal(denied.ok, false);
    if (denied.ok) throw new Error("main merge unexpectedly bypassed approval");
    assert.equal(denied.error.code, "approval_required");

    const merged = await mergeService.mergeGoal({
      projectRoot: fixture.root,
      goalId: "GOAL-007",
      approval: await acceptedApproval(),
    });
    assert.equal(merged.ok, true);
    if (!merged.ok) throw new Error(merged.error.message);
    assert.equal(merged.value.mainBranch, "main");
    assert.notEqual(merged.value.commit, fixture.main);
    assert.equal(
      await runGit(git, fixture.root, ["branch", "--show-current"]),
      "main",
    );
    const log = await runGit(git, fixture.root, [
      "log",
      "-1",
      "--format=%s%n%b",
    ]);
    assert.match(log, /merge\(goal\): 合并 GOAL-007/);
    assert.match(log, /Tasks: TASK-034/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
