import { lstat, mkdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import type { GoalId, TaskId } from "@personal-ai-operator/contracts";

import { defaultAppDataDirectory } from "../registry/registry-database.js";
import { GitBootstrapService } from "./git-bootstrap.js";
import { GitProcess, type GitCommandResult } from "./git-process.js";
import {
  sharedProjectWriteQueue,
  type ProjectWriteQueue,
} from "../files/project-write-queue.js";
import { sha256Content } from "../files/content-hash.js";

export const defaultWorktreeDirectoryName = "worktrees";

export type GitWorktreeErrorCode =
  | "invalid_request"
  | "invalid_path"
  | "not_repository"
  | "git_failed"
  | "worktree_conflict"
  | "task_in_use"
  | "dirty_worktree"
  | "not_found";

export type GitWorktreeError = Readonly<{
  readonly code: GitWorktreeErrorCode;
  readonly message: string;
  readonly details: readonly string[];
}>;

export type GitWorktreeResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: GitWorktreeError }>;

export type GitWorktreeRequest = Readonly<{
  readonly projectRoot: string;
  readonly goalId: GoalId | string;
  readonly taskId: TaskId | string;
  readonly runtimeDirectory?: string;
  readonly baseRef?: string;
}>;

export type GoalBranchRequest = Readonly<{
  readonly projectRoot: string;
  readonly goalId: GoalId | string;
  readonly baseRef?: string;
}>;

export type GitWorktreeRecord = Readonly<{
  readonly projectRoot: string;
  readonly projectKey: string;
  readonly goalId: string;
  readonly taskId: string;
  readonly goalBranch: string;
  readonly taskBranch: string;
  readonly worktreePath: string;
  readonly head: string;
  readonly branchExists: boolean;
}>;

export type GoalBranchRecord = Readonly<{
  readonly projectRoot: string;
  readonly goalId: string;
  readonly branch: string;
  readonly head: string;
  readonly created: boolean;
}>;

export type GitWorktreeLifecycle =
  | Readonly<{
      readonly state: "created" | "existing";
      readonly record: GitWorktreeRecord;
    }>
  | Readonly<{ readonly state: "retained"; readonly record: GitWorktreeRecord }>
  | Readonly<{ readonly state: "removed"; readonly record: GitWorktreeRecord }>;

export type GitWorktreeCleanupRequest = GitWorktreeRequest &
  Readonly<{ readonly retain?: boolean }>;

function failure<Value>(
  code: GitWorktreeErrorCode,
  message: string,
  details: readonly string[] = [],
): GitWorktreeResult<Value> {
  return { ok: false, error: { code, message, details } };
}

function successful(command: GitCommandResult): boolean {
  return command.exitCode === 0 && command.error === null;
}

function commandDetails(command: GitCommandResult): readonly string[] {
  return [
    ...[command.stdout, command.stderr].filter(
      (value) => value.trim().length > 0,
    ),
    ...(command.error === null ? [] : [command.error]),
  ];
}

function validGoalId(value: string): boolean {
  return /^GOAL-[0-9]{3}$/.test(value) && Number(value.slice(5)) > 0;
}

function validTaskId(value: string): boolean {
  return /^TASK-[0-9]{3}$/.test(value) && Number(value.slice(5)) > 0;
}

export function goalBranchName(goalId: GoalId | string): string {
  return `goal/${goalId}`;
}

export function taskBranchName(taskId: TaskId | string): string {
  return `task/${taskId}`;
}

export function worktreeProjectKey(projectRoot: string): string {
  return sha256Content(resolve(projectRoot));
}

export function worktreeRoot(
  projectRoot: string,
  runtimeDirectory = join(
    defaultAppDataDirectory(),
    "runtime",
    defaultWorktreeDirectoryName,
  ),
): string {
  return resolve(runtimeDirectory, worktreeProjectKey(projectRoot));
}

export function taskWorktreePath(request: GitWorktreeRequest): string {
  return resolve(
    worktreeRoot(request.projectRoot, request.runtimeDirectory),
    request.goalId,
    request.taskId,
  );
}

function isInside(parent: string, candidate: string): boolean {
  const relativePath = relative(resolve(parent), resolve(candidate));
  return (
    relativePath.length > 0 &&
    relativePath !== ".." &&
    !relativePath.startsWith("..\\") &&
    !relativePath.startsWith("../") &&
    !isAbsolute(relativePath)
  );
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

type ParsedWorktree = Readonly<{
  readonly path: string;
  readonly head: string;
  readonly branch: string | null;
}>;

function parseWorktreeList(output: string): readonly ParsedWorktree[] {
  const records: ParsedWorktree[] = [];
  let path: string | null = null;
  let head = "";
  let branch: string | null = null;
  const flush = () => {
    if (path !== null) records.push({ path, head, branch });
    path = null;
    head = "";
    branch = null;
  };
  for (const line of output.split(/\r?\n/)) {
    if (line.length === 0) {
      flush();
    } else if (line.startsWith("worktree ")) {
      path = line.slice("worktree ".length);
    } else if (line.startsWith("HEAD ")) {
      head = line.slice("HEAD ".length).trim();
    } else if (line.startsWith("branch refs/heads/")) {
      branch = line.slice("branch refs/heads/".length).trim();
    }
  }
  flush();
  return records;
}

export class GitWorktreeService {
  private readonly git: GitProcess;
  private readonly bootstrap: GitBootstrapService;
  private readonly writeQueue: ProjectWriteQueue;

  public constructor(
    git: GitProcess = new GitProcess(),
    bootstrap = new GitBootstrapService(git),
    writeQueue: ProjectWriteQueue = sharedProjectWriteQueue,
  ) {
    this.git = git;
    this.bootstrap = bootstrap;
    this.writeQueue = writeQueue;
  }

  public async ensureGoalBranch(
    request: GoalBranchRequest,
  ): Promise<GitWorktreeResult<GoalBranchRecord>> {
    return this.writeQueue.enqueue(resolve(request.projectRoot), () =>
      this.ensureGoalBranchLocked(request),
    );
  }

  public async createTaskWorktree(
    request: GitWorktreeRequest,
  ): Promise<GitWorktreeResult<GitWorktreeLifecycle>> {
    const validation = this.validateRequest(request);
    if (!validation.ok) return validation;
    return this.writeQueue.enqueue(resolve(request.projectRoot), async () => {
      const goal = await this.ensureGoalBranchLocked({
        projectRoot: request.projectRoot,
        goalId: request.goalId,
        ...(request.baseRef === undefined ? {} : { baseRef: request.baseRef }),
      });
      if (!goal.ok) return goal;

      const expectedPath = taskWorktreePath(request);
      const taskBranch = taskBranchName(request.taskId);
      const existing = await this.inspectLocked(request, expectedPath);
      if (!existing.ok) return existing;
      if (existing.value !== null) {
        return {
          ok: true,
          value: { state: "existing", record: existing.value },
        };
      }
      if (await pathExists(expectedPath)) {
        return failure(
          "worktree_conflict",
          "The deterministic Worktree path is occupied by an unknown directory.",
          [expectedPath],
        );
      }

      const listed = await this.listGitWorktrees(request.projectRoot);
      if (!listed.ok) return listed;
      const branchWorktree = listed.value.find(
        (worktree) => worktree.branch === taskBranch,
      );
      if (branchWorktree !== undefined) {
        return failure(
          "task_in_use",
          "The task branch is already attached to another Worktree.",
          [branchWorktree.path],
        );
      }

      await mkdir(resolve(expectedPath, ".."), { recursive: true });
      const branchExists = await this.branchExists(
        request.projectRoot,
        taskBranch,
      );
      const added = await this.git.run(
        branchExists
          ? ["worktree", "add", expectedPath, taskBranch]
          : [
              "worktree",
              "add",
              "-b",
              taskBranch,
              expectedPath,
              goal.value.branch,
            ],
        resolve(request.projectRoot),
      );
      if (!successful(added)) {
        return failure(
          "git_failed",
          "Task Worktree could not be created.",
          commandDetails(added),
        );
      }

      const record = await this.inspectLocked(request, expectedPath);
      if (!record.ok) return record;
      if (record.value === null) {
        return failure(
          "git_failed",
          "Git created a Worktree that could not be recovered by query.",
          [expectedPath, taskBranch],
        );
      }
      return { ok: true, value: { state: "created", record: record.value } };
    });
  }

  public async inspectTaskWorktree(
    request: GitWorktreeRequest,
  ): Promise<GitWorktreeResult<GitWorktreeRecord | null>> {
    const validation = this.validateRequest(request);
    if (!validation.ok) return validation;
    return this.inspectLocked(request, taskWorktreePath(request));
  }

  public async listTaskWorktrees(
    projectRoot: string,
  ): Promise<GitWorktreeResult<readonly ParsedWorktree[]>> {
    return this.listGitWorktrees(resolve(projectRoot));
  }

  public async cleanupTaskWorktree(
    request: GitWorktreeCleanupRequest,
  ): Promise<GitWorktreeResult<GitWorktreeLifecycle>> {
    const validation = this.validateRequest(request);
    if (!validation.ok) return validation;
    return this.writeQueue.enqueue(resolve(request.projectRoot), async () => {
      const expectedPath = taskWorktreePath(request);
      if (
        !isInside(
          worktreeRoot(request.projectRoot, request.runtimeDirectory),
          expectedPath,
        )
      ) {
        return failure(
          "invalid_path",
          "Worktree cleanup target must remain inside the runtime Worktree directory.",
        );
      }
      const inspected = await this.inspectLocked(request, expectedPath);
      if (!inspected.ok) return inspected;
      if (inspected.value === null) {
        return failure("not_found", "Task Worktree was not found.", [
          expectedPath,
        ]);
      }
      if (request.retain === true) {
        return {
          ok: true,
          value: { state: "retained", record: inspected.value },
        };
      }

      const status = await this.git.run(
        ["status", "--porcelain=v1", "--untracked-files=all"],
        inspected.value.worktreePath,
      );
      if (!successful(status)) {
        return failure(
          "git_failed",
          "Task Worktree status could not be read.",
          commandDetails(status),
        );
      }
      if (status.stdout.trim().length > 0) {
        return failure(
          "dirty_worktree",
          "Dirty Worktrees must be retained or cleaned by the executor before removal.",
          [inspected.value.worktreePath],
        );
      }

      const removed = await this.git.run(
        ["worktree", "remove", inspected.value.worktreePath],
        resolve(request.projectRoot),
      );
      if (!successful(removed)) {
        return failure(
          "git_failed",
          "Task Worktree could not be safely removed.",
          commandDetails(removed),
        );
      }
      return { ok: true, value: { state: "removed", record: inspected.value } };
    });
  }

  private validateRequest(
    request: GitWorktreeRequest,
  ): GitWorktreeResult<null> {
    if (!isAbsolute(request.projectRoot)) {
      return failure(
        "invalid_request",
        "Project root must be an absolute path.",
      );
    }
    if (!validGoalId(String(request.goalId))) {
      return failure("invalid_request", "Goal ID is invalid.");
    }
    if (!validTaskId(String(request.taskId))) {
      return failure("invalid_request", "Task ID is invalid.");
    }
    if (
      request.runtimeDirectory !== undefined &&
      !isAbsolute(request.runtimeDirectory)
    ) {
      return failure("invalid_path", "Runtime directory must be absolute.");
    }
    return { ok: true, value: null };
  }

  private async ensureGoalBranchLocked(
    request: GoalBranchRequest,
  ): Promise<GitWorktreeResult<GoalBranchRecord>> {
    if (!validGoalId(String(request.goalId))) {
      return failure("invalid_request", "Goal ID is invalid.");
    }
    const rootPath = resolve(request.projectRoot);
    const detection = await this.bootstrap.detect(rootPath);
    if (!detection.ok) {
      return failure(
        "not_repository",
        detection.error.message,
        detection.error.details,
      );
    }
    if (detection.value.state !== "existing_repository") {
      return failure(
        "not_repository",
        "A valid Git repository is required for a target branch.",
        detection.value.details,
      );
    }
    const branch = goalBranchName(request.goalId);
    const exists = await this.branchExists(rootPath, branch);
    if (exists) {
      const head = await this.branchHead(rootPath, branch);
      if (!head.ok) return head;
      return {
        ok: true,
        value: {
          projectRoot: rootPath,
          goalId: String(request.goalId),
          branch,
          head: head.value,
          created: false,
        },
      };
    }
    const baseRef = request.baseRef ?? "HEAD";
    const created = await this.git.run(["branch", branch, baseRef], rootPath);
    if (!successful(created)) {
      return failure(
        "git_failed",
        "Goal branch could not be created.",
        commandDetails(created),
      );
    }
    const head = await this.branchHead(rootPath, branch);
    if (!head.ok) return head;
    return {
      ok: true,
      value: {
        projectRoot: rootPath,
        goalId: String(request.goalId),
        branch,
        head: head.value,
        created: true,
      },
    };
  }

  private async inspectLocked(
    request: GitWorktreeRequest,
    expectedPath: string,
  ): Promise<GitWorktreeResult<GitWorktreeRecord | null>> {
    const listed = await this.listGitWorktrees(resolve(request.projectRoot));
    if (!listed.ok) return listed;
    const taskBranch = taskBranchName(request.taskId);
    const entry = listed.value.find(
      (worktree) =>
        resolve(worktree.path) === resolve(expectedPath) ||
        worktree.branch === taskBranch,
    );
    if (entry === undefined) return { ok: true, value: null };
    if (
      resolve(entry.path) !== resolve(expectedPath) ||
      entry.branch !== taskBranch
    ) {
      return failure(
        "worktree_conflict",
        "The task branch or deterministic Worktree path is already occupied.",
        [entry.path, entry.branch ?? "detached"],
      );
    }
    return {
      ok: true,
      value: {
        projectRoot: resolve(request.projectRoot),
        projectKey: worktreeProjectKey(request.projectRoot),
        goalId: String(request.goalId),
        taskId: String(request.taskId),
        goalBranch: goalBranchName(request.goalId),
        taskBranch,
        worktreePath: resolve(entry.path),
        head: entry.head,
        branchExists: true,
      },
    };
  }

  private async listGitWorktrees(
    projectRoot: string,
  ): Promise<GitWorktreeResult<readonly ParsedWorktree[]>> {
    const detection = await this.bootstrap.detect(projectRoot);
    if (!detection.ok) {
      return failure(
        "not_repository",
        detection.error.message,
        detection.error.details,
      );
    }
    if (detection.value.state !== "existing_repository") {
      return failure("not_repository", "A valid Git repository is required.");
    }
    const listed = await this.git.run(
      ["worktree", "list", "--porcelain"],
      projectRoot,
    );
    if (!successful(listed)) {
      return failure(
        "git_failed",
        "Git Worktrees could not be listed.",
        commandDetails(listed),
      );
    }
    return { ok: true, value: parseWorktreeList(listed.stdout) };
  }

  private async branchExists(
    projectRoot: string,
    branch: string,
  ): Promise<boolean> {
    const result = await this.git.run(
      ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
      projectRoot,
    );
    return result.exitCode === 0 && result.error === null;
  }

  private async branchHead(
    projectRoot: string,
    branch: string,
  ): Promise<GitWorktreeResult<string>> {
    const result = await this.git.run(["rev-parse", branch], projectRoot);
    if (!successful(result) || result.stdout.trim().length === 0) {
      return failure(
        "git_failed",
        "Git branch head could not be read.",
        commandDetails(result),
      );
    }
    return { ok: true, value: result.stdout.trim() };
  }
}
