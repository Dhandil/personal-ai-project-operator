import { lstat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { GitProcess, type GitCommandResult } from "./git-process.js";

export const baselineCommitSubject =
  "chore(governance): initialize project baseline";
export const baselineCommitTask = "Tasks: TASK-016";

export type GitRepositoryState =
  "no_repository" | "existing_repository" | "invalid_repository";

export type GitDetection = Readonly<{
  readonly rootPath: string;
  readonly state: GitRepositoryState;
  readonly gitDirectory: string | null;
  readonly head: string | null;
  readonly branch: string | null;
  readonly clean: boolean | null;
  readonly details: readonly string[];
}>;

export type GitBootstrapApproval = Readonly<{
  readonly approved: boolean;
  readonly approvalId: string;
}>;

export type GitBootstrapRequest = Readonly<{
  readonly projectRoot: string;
  readonly approval: GitBootstrapApproval;
}>;

export type GitBaselineCommit = Readonly<{
  readonly hash: string;
  readonly subject: typeof baselineCommitSubject;
  readonly body: typeof baselineCommitTask;
}>;

export type GitBootstrapOutcome =
  | Readonly<{
      readonly kind: "not_approved";
      readonly detection: GitDetection;
    }>
  | Readonly<{
      readonly kind: "already_initialized";
      readonly detection: GitDetection;
      readonly commit: GitBaselineCommit | null;
    }>
  | Readonly<{
      readonly kind: "initialized";
      readonly detection: GitDetection;
      readonly commit: GitBaselineCommit | null;
    }>;

export type GitBootstrapErrorCode =
  | "invalid_path"
  | "git_unavailable"
  | "invalid_repository"
  | "initialization_failed"
  | "commit_failed"
  | "no_changes";

export type GitBootstrapError = Readonly<{
  readonly code: GitBootstrapErrorCode;
  readonly message: string;
  readonly details: readonly string[];
}>;

export type GitBootstrapResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: GitBootstrapError }>;

export type GitBaselineResult = GitBootstrapResult<
  | Readonly<{ readonly kind: "committed"; readonly commit: GitBaselineCommit }>
  | Readonly<{ readonly kind: "no_changes"; readonly commit: null }>
>;

function failure<Value>(
  code: GitBootstrapErrorCode,
  message: string,
  details: readonly string[] = [],
): GitBootstrapResult<Value> {
  return { ok: false, error: { code, message, details } };
}

function commandDetails(command: GitCommandResult): readonly string[] {
  return [
    ...[command.stdout, command.stderr].filter(
      (value) => value.trim().length > 0,
    ),
    ...(command.error === null ? [] : [command.error]),
  ];
}

function isSuccessful(command: GitCommandResult): boolean {
  return command.exitCode === 0 && command.error === null;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

export class GitBootstrapService {
  private readonly git: GitProcess;

  public constructor(git: GitProcess = new GitProcess()) {
    this.git = git;
  }

  public async detect(
    projectRoot: string,
  ): Promise<GitBootstrapResult<GitDetection>> {
    const rootPath = resolve(projectRoot);
    if (!(await pathExists(rootPath))) {
      return failure("invalid_path", "Project root does not exist.", [
        rootPath,
      ]);
    }

    const probe = await this.git.run(
      ["rev-parse", "--show-toplevel"],
      rootPath,
    );
    const gitDirectoryProbe = await this.git.run(
      ["rev-parse", "--git-dir"],
      rootPath,
    );
    if (isSuccessful(probe) && isSuccessful(gitDirectoryProbe)) {
      const headProbe = await this.git.run(["rev-parse", "HEAD"], rootPath);
      const branchProbe = await this.git.run(
        ["symbolic-ref", "--quiet", "--short", "HEAD"],
        rootPath,
      );
      const statusProbe = await this.git.run(
        ["status", "--porcelain=v1"],
        rootPath,
      );
      const gitDirectory = gitDirectoryProbe.stdout.trim();
      return {
        ok: true,
        value: {
          rootPath,
          state: "existing_repository",
          gitDirectory:
            gitDirectory.length === 0 ? null : resolve(rootPath, gitDirectory),
          head: isSuccessful(headProbe) ? headProbe.stdout.trim() : null,
          branch: isSuccessful(branchProbe) ? branchProbe.stdout.trim() : null,
          clean: isSuccessful(statusProbe)
            ? statusProbe.stdout.trim().length === 0
            : null,
          details: [],
        },
      };
    }

    const localGitPath = join(rootPath, ".git");
    if (await pathExists(localGitPath)) {
      return {
        ok: true,
        value: {
          rootPath,
          state: "invalid_repository",
          gitDirectory: null,
          head: null,
          branch: null,
          clean: null,
          details: [
            ...commandDetails(probe),
            ...commandDetails(gitDirectoryProbe),
          ],
        },
      };
    }
    if (
      [...commandDetails(probe), ...commandDetails(gitDirectoryProbe)].some(
        (detail) => detail.toLowerCase().includes("not found"),
      )
    ) {
      return failure("git_unavailable", "Git executable is not available.", [
        ...commandDetails(probe),
        ...commandDetails(gitDirectoryProbe),
      ]);
    }
    return {
      ok: true,
      value: {
        rootPath,
        state: "no_repository",
        gitDirectory: null,
        head: null,
        branch: null,
        clean: null,
        details: [],
      },
    };
  }

  public async bootstrap(
    request: GitBootstrapRequest,
  ): Promise<GitBootstrapResult<GitBootstrapOutcome>> {
    const detected = await this.detect(request.projectRoot);
    if (!detected.ok) {
      return detected;
    }
    if (!request.approval.approved) {
      return {
        ok: true,
        value: { kind: "not_approved", detection: detected.value },
      };
    }
    if (detected.value.state === "invalid_repository") {
      return failure(
        "invalid_repository",
        "An existing .git path is not a valid repository; refusing to replace it.",
        detected.value.details,
      );
    }
    if (detected.value.state === "existing_repository") {
      return {
        ok: true,
        value: {
          kind: "already_initialized",
          detection: detected.value,
          commit: null,
        },
      };
    }

    const initialized = await this.git.run(
      ["init", "--initial-branch=main"],
      detected.value.rootPath,
    );
    if (!isSuccessful(initialized)) {
      return failure(
        "initialization_failed",
        "Git repository initialization failed.",
        commandDetails(initialized),
      );
    }
    const afterInit = await this.detect(detected.value.rootPath);
    if (!afterInit.ok) {
      return afterInit;
    }
    const baseline = await this.commitBaseline(
      detected.value.rootPath,
      request.approval,
    );
    if (!baseline.ok) {
      return baseline;
    }
    return {
      ok: true,
      value: {
        kind: "initialized",
        detection: afterInit.value,
        commit:
          baseline.value.kind === "committed" ? baseline.value.commit : null,
      },
    };
  }

  public async commitBaseline(
    projectRoot: string,
    approval: GitBootstrapApproval,
  ): Promise<GitBaselineResult> {
    const detected = await this.detect(projectRoot);
    if (!detected.ok) {
      return detected;
    }
    if (!approval.approved) {
      return failure(
        "initialization_failed",
        "User approval is required before committing a baseline.",
      );
    }
    if (detected.value.state !== "existing_repository") {
      return failure(
        "invalid_repository",
        "A valid Git repository is required before creating a baseline commit.",
        detected.value.details,
      );
    }

    const added = await this.git.run(
      ["add", "--", ".personal-workspace"],
      detected.value.rootPath,
    );
    if (!isSuccessful(added)) {
      return failure(
        "commit_failed",
        "Governance files could not be staged.",
        commandDetails(added),
      );
    }
    const staged = await this.git.run(
      ["diff", "--cached", "--quiet", "--", ".personal-workspace"],
      detected.value.rootPath,
    );
    if (staged.exitCode === 0) {
      return { ok: true, value: { kind: "no_changes", commit: null } };
    }
    if (staged.exitCode !== 1) {
      return failure(
        "commit_failed",
        "Staged governance changes could not be inspected.",
        commandDetails(staged),
      );
    }
    const committed = await this.git.run(
      [
        "commit",
        "--only",
        "-m",
        baselineCommitSubject,
        "-m",
        baselineCommitTask,
        "--",
        ".personal-workspace",
      ],
      detected.value.rootPath,
    );
    if (!isSuccessful(committed)) {
      return failure(
        "commit_failed",
        "Governance baseline commit failed.",
        commandDetails(committed),
      );
    }
    const head = await this.git.run(
      ["rev-parse", "HEAD"],
      detected.value.rootPath,
    );
    if (!isSuccessful(head) || head.stdout.trim().length === 0) {
      return failure(
        "commit_failed",
        "Baseline commit hash could not be read.",
        commandDetails(head),
      );
    }
    return {
      ok: true,
      value: {
        kind: "committed",
        commit: {
          hash: head.stdout.trim(),
          subject: baselineCommitSubject,
          body: baselineCommitTask,
        },
      },
    };
  }
}
