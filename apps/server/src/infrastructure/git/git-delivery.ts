import { isAbsolute, resolve } from "node:path";

import {
  isApprovalAccepted,
  type Approval,
} from "@personal-ai-operator/domain";

import type { ApprovalView } from "../approvals/approval-service.js";
import { ApprovalService } from "../approvals/approval-service.js";
import {
  GitChangeBoundaryService,
  type GitChangeSnapshot,
} from "./git-change-boundary.js";
import { GitBootstrapService } from "./git-bootstrap.js";
import {
  createTaskCommitMessage,
  type CommitMessage,
} from "./git-commit-message.js";
import { GitProcess, type GitCommandResult } from "./git-process.js";

export type GitDeliveryErrorCode =
  | "invalid_request"
  | "not_accepted"
  | "invalid_message"
  | "not_repository"
  | "wrong_branch"
  | "boundary_violation"
  | "no_changes"
  | "git_failed"
  | "approval_required"
  | "invalid_approval"
  | "merge_conflict";

export type GitDeliveryError = Readonly<{
  readonly code: GitDeliveryErrorCode;
  readonly message: string;
  readonly details: readonly string[];
}>;

export type GitDeliveryResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: GitDeliveryError }>;

export type TaskDeliveryRequest = Readonly<{
  readonly projectRoot: string;
  readonly goalId?: string;
  readonly taskId: string;
  readonly taskStatus: string;
  readonly accepted: boolean;
  readonly allowedPaths: readonly string[];
  readonly forbiddenPaths: readonly string[];
  readonly commitType: string;
  readonly commitScope: string;
  readonly commitDescription: string;
  readonly taskBranch?: string;
  readonly baseline?: GitChangeSnapshot;
}>;

export type TaskCommitResult = Readonly<{
  readonly taskId: string;
  readonly branch: string;
  readonly commit: string;
  readonly message: CommitMessage;
  readonly changedPaths: readonly string[];
}>;

export type TaskDeliveryResult = Readonly<{
  readonly task: TaskCommitResult;
  readonly goalBranch: string;
  readonly goalCommit: string;
}>;

export type MainMergeApproval = Readonly<{
  readonly approvalId: string;
  readonly operation: "main_merge";
  readonly approval: Approval;
  readonly subjectSnapshot: Readonly<{
    readonly revision: number;
    readonly hash: string;
  }>;
  readonly currentSnapshot: Readonly<{
    readonly revision: number;
    readonly hash: string;
  }> | null;
  readonly stale: boolean;
}>;

export type GoalMergeRequest = Readonly<{
  readonly projectRoot: string;
  readonly goalId: string;
  readonly taskId: string;
  readonly projectKey?: string;
  readonly approval?: MainMergeApproval;
  readonly mainBranch?: string;
}>;

export type GoalMergeResult = Readonly<{
  readonly goalId: string;
  readonly goalBranch: string;
  readonly mainBranch: string;
  readonly commit: string;
  readonly previousMain: string;
}>;

type ApprovalGate = Readonly<{
  readonly getMainMergeApproval: (
    projectKey: string,
    goalId: string,
  ) => Promise<GitDeliveryResult<MainMergeApproval>>;
}>;

function failure<Value>(
  code: GitDeliveryErrorCode,
  message: string,
  details: readonly string[] = [],
): GitDeliveryResult<Value> {
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

function mapBoundaryFailure<Value>(
  error: Readonly<{
    readonly code: string;
    readonly message: string;
    readonly details: readonly string[];
  }>,
): GitDeliveryResult<Value> {
  const code =
    error.code === "not_repository"
      ? "not_repository"
      : error.code === "invalid_path"
        ? "invalid_request"
        : "git_failed";
  return failure(code, error.message, error.details);
}

function validGoalId(value: string): boolean {
  return /^GOAL-[0-9]{3}$/.test(value) && Number(value.slice(5)) > 0;
}

function validTaskId(value: string): boolean {
  return /^TASK-[0-9]{3}$/.test(value) && Number(value.slice(5)) > 0;
}

function taskBranch(taskId: string): string {
  return `task/${taskId}`;
}

function goalBranch(goalId: string): string {
  return `goal/${goalId}`;
}

function emptyBaseline(snapshot: GitChangeSnapshot): GitChangeSnapshot {
  return { ...snapshot, entries: [] };
}

function isApprovalForGoal(
  approval: MainMergeApproval,
  goalId: string,
): boolean {
  return (
    approval.operation === "main_merge" &&
    approval.approval.approvalType ===
      "short_term_goal_acceptance_and_main_merge" &&
    approval.approval.subjectId === goalId &&
    isApprovalAccepted(approval.approval) &&
    approval.approval.decision?.decidedBy === "user" &&
    approval.stale === false &&
    approval.currentSnapshot !== null &&
    approval.currentSnapshot.revision === approval.subjectSnapshot.revision &&
    approval.currentSnapshot.hash === approval.subjectSnapshot.hash
  );
}

export function validateMainMergeApproval(
  approval: MainMergeApproval,
  goalId: string,
): boolean {
  return isApprovalForGoal(approval, goalId);
}

export class FileApprovalGateAdapter implements ApprovalGate {
  private readonly approvals: ApprovalService;

  public constructor(approvals: ApprovalService = new ApprovalService()) {
    this.approvals = approvals;
  }

  public async getMainMergeApproval(
    projectKey: string,
    goalId: string,
  ): Promise<GitDeliveryResult<MainMergeApproval>> {
    const page = await this.approvals.getApprovals(projectKey);
    if (!page.ok) {
      return failure(
        "invalid_approval",
        page.error.message,
        page.error.details,
      );
    }
    const view = page.value.approvals.find(
      (candidate) =>
        candidate.operation === "main_merge" &&
        candidate.approval.subjectId === goalId,
    );
    if (view === undefined) {
      return failure(
        "approval_required",
        "A user-approved main merge approval is required.",
      );
    }
    const approval = toMainMergeApproval(view);
    return isApprovalForGoal(approval, goalId)
      ? { ok: true, value: approval }
      : failure(
          "invalid_approval",
          "The main merge approval is stale or not approved by the user.",
        );
  }
}

function toMainMergeApproval(view: ApprovalView): MainMergeApproval {
  return {
    approvalId: view.approvalId,
    operation: "main_merge",
    approval: view.approval,
    subjectSnapshot: view.subjectSnapshot,
    currentSnapshot: view.currentSnapshot,
    stale: view.stale,
  };
}

export class GitTaskDeliveryService {
  private readonly git: GitProcess;
  private readonly boundary: GitChangeBoundaryService;
  private readonly bootstrap: GitBootstrapService;

  public constructor(
    git: GitProcess = new GitProcess(),
    boundary = new GitChangeBoundaryService(git),
    bootstrap = new GitBootstrapService(git),
  ) {
    this.git = git;
    this.boundary = boundary;
    this.bootstrap = bootstrap;
  }

  public async commitTask(
    request: TaskDeliveryRequest,
  ): Promise<GitDeliveryResult<TaskCommitResult>> {
    if (!isAbsolute(request.projectRoot) || !validTaskId(request.taskId)) {
      return failure("invalid_request", "Project root or task ID is invalid.");
    }
    if (request.taskStatus !== "completed" || request.accepted !== true) {
      return failure(
        "not_accepted",
        "Only an independently accepted task may be committed.",
      );
    }
    const message = createTaskCommitMessage({
      type: request.commitType,
      scope: request.commitScope,
      description: request.commitDescription,
      taskId: request.taskId,
    });
    if (!message.ok) {
      return failure("invalid_message", message.error.message);
    }

    const root = resolve(request.projectRoot);
    const detected = await this.bootstrap.detect(root);
    if (!detected.ok) {
      return failure(
        "not_repository",
        detected.error.message,
        detected.error.details,
      );
    }
    if (detected.value.state !== "existing_repository") {
      return failure("not_repository", "A valid Git repository is required.");
    }
    const expectedBranch = request.taskBranch ?? taskBranch(request.taskId);
    if (detected.value.branch !== expectedBranch || expectedBranch === "main") {
      return failure(
        "wrong_branch",
        `Task delivery must run on ${expectedBranch}.`,
        [detected.value.branch ?? "detached"],
      );
    }
    const current = await this.boundary.capture(root);
    if (!current.ok) return mapBoundaryFailure(current.error);
    const baseline = request.baseline ?? emptyBaseline(current.value);
    const checked = await this.boundary.validate(baseline, {
      allowedPaths: request.allowedPaths,
      forbiddenPaths: request.forbiddenPaths,
    });
    if (!checked.ok) return mapBoundaryFailure(checked.error);
    if (!checked.value.passed) {
      return failure(
        "boundary_violation",
        "Task changes are outside the approved delivery boundary.",
        checked.value.violations.map((violation) => violation.message),
      );
    }
    if (checked.value.changes.length === 0) {
      return failure("no_changes", "There are no changes to commit.");
    }

    const added = await this.git.run(
      ["add", "--", ...request.allowedPaths],
      root,
    );
    if (!successful(added)) {
      return failure(
        "git_failed",
        "Task changes could not be staged.",
        commandDetails(added),
      );
    }
    const committed = await this.git.run(
      [
        "commit",
        "--only",
        "-m",
        message.value.subject,
        "-m",
        message.value.body,
        "--",
        ...request.allowedPaths,
      ],
      root,
    );
    if (!successful(committed)) {
      return failure(
        "git_failed",
        "Task changes could not be committed.",
        commandDetails(committed),
      );
    }
    const head = await this.git.run(["rev-parse", "HEAD"], root);
    if (!successful(head) || head.stdout.trim().length === 0) {
      return failure(
        "git_failed",
        "The task commit hash could not be read.",
        commandDetails(head),
      );
    }
    return {
      ok: true,
      value: {
        taskId: request.taskId,
        branch: expectedBranch,
        commit: head.stdout.trim(),
        message: message.value,
        changedPaths: checked.value.changes.map((entry) => entry.path),
      },
    };
  }

  public async deliverTask(
    request: TaskDeliveryRequest & Readonly<{ readonly goalId: string }>,
  ): Promise<GitDeliveryResult<TaskDeliveryResult>> {
    if (!validGoalId(request.goalId)) {
      return failure("invalid_request", "Goal ID is invalid.");
    }
    const committed = await this.commitTask(request);
    if (!committed.ok) return committed;

    const root = resolve(request.projectRoot);
    const goal = goalBranch(request.goalId);
    const task = taskBranch(request.taskId);
    const goalHead = await this.git.run(["rev-parse", goal], root);
    if (!successful(goalHead)) {
      return failure(
        "git_failed",
        "The goal branch could not be read.",
        commandDetails(goalHead),
      );
    }
    const switched = await this.git.run(["switch", goal], root);
    if (!successful(switched)) {
      return failure(
        "git_failed",
        "The repository could not switch to the goal branch.",
        commandDetails(switched),
      );
    }
    const merged = await this.git.run(
      [
        "merge",
        "--no-ff",
        "-m",
        `merge(task): 合并 ${request.taskId}`,
        "-m",
        `Tasks: ${request.taskId}`,
        task,
      ],
      root,
    );
    if (!successful(merged)) {
      await this.git.run(["merge", "--abort"], root);
      await this.git.run(["switch", task], root);
      return failure(
        "merge_conflict",
        "The accepted task could not be merged into the goal branch.",
        commandDetails(merged),
      );
    }
    const mergedHead = await this.git.run(["rev-parse", "HEAD"], root);
    if (!successful(mergedHead) || mergedHead.stdout.trim().length === 0) {
      return failure(
        "git_failed",
        "The goal merge commit hash could not be read.",
        commandDetails(mergedHead),
      );
    }
    return {
      ok: true,
      value: {
        task: committed.value,
        goalBranch: goal,
        goalCommit: mergedHead.stdout.trim(),
      },
    };
  }
}

export class GitGoalMergeService {
  private readonly git: GitProcess;
  private readonly bootstrap: GitBootstrapService;
  private readonly approvalGate: ApprovalGate;

  public constructor(
    git: GitProcess = new GitProcess(),
    bootstrap = new GitBootstrapService(git),
    approvalGate: ApprovalGate = new FileApprovalGateAdapter(),
  ) {
    this.git = git;
    this.bootstrap = bootstrap;
    this.approvalGate = approvalGate;
  }

  public async mergeGoal(
    request: GoalMergeRequest,
  ): Promise<GitDeliveryResult<GoalMergeResult>> {
    if (
      !isAbsolute(request.projectRoot) ||
      !validGoalId(request.goalId) ||
      !validTaskId(request.taskId)
    ) {
      return failure("invalid_request", "Project root or goal ID is invalid.");
    }
    const root = resolve(request.projectRoot);
    const main = request.mainBranch ?? "main";
    if (main !== "main") {
      return failure("invalid_request", "The protected branch must be main.");
    }
    let approval = request.approval;
    if (approval === undefined) {
      if (
        request.projectKey === undefined ||
        request.projectKey.trim().length === 0
      ) {
        return failure(
          "approval_required",
          "A project key is required to load main merge approval.",
        );
      }
      const loaded = await this.approvalGate.getMainMergeApproval(
        request.projectKey,
        request.goalId,
      );
      if (!loaded.ok) return loaded;
      approval = loaded.value;
    }
    if (!isApprovalForGoal(approval, request.goalId)) {
      return failure(
        "approval_required",
        "A current user-approved main merge approval is required.",
      );
    }

    const detected = await this.bootstrap.detect(root);
    if (!detected.ok) {
      return failure(
        "not_repository",
        detected.error.message,
        detected.error.details,
      );
    }
    if (detected.value.state !== "existing_repository") {
      return failure("not_repository", "A valid Git repository is required.");
    }
    const goal = goalBranch(request.goalId);
    const mainHead = await this.git.run(["rev-parse", main], root);
    const goalHead = await this.git.run(["rev-parse", goal], root);
    if (!successful(mainHead) || !successful(goalHead)) {
      return failure(
        "git_failed",
        "The main or goal branch could not be read.",
        [...commandDetails(mainHead), ...commandDetails(goalHead)],
      );
    }
    const status = await this.git.run(
      ["status", "--porcelain=v1", "--untracked-files=all"],
      root,
    );
    if (!successful(status)) {
      return failure(
        "git_failed",
        "The repository status could not be read.",
        commandDetails(status),
      );
    }
    if (status.stdout.trim().length > 0) {
      return failure(
        "git_failed",
        "A clean worktree is required before merging.",
      );
    }
    const originalBranch = detected.value.branch;
    if (originalBranch === null) {
      return failure(
        "wrong_branch",
        "The repository must be on a named branch before merging.",
      );
    }
    const switched =
      originalBranch === main
        ? { exitCode: 0, stdout: "", stderr: "", error: null }
        : await this.git.run(["switch", main], root);
    if (!successful(switched)) {
      return failure(
        "git_failed",
        "The repository could not switch to main.",
        commandDetails(switched),
      );
    }
    const merged = await this.git.run(
      [
        "merge",
        "--no-ff",
        "-m",
        `merge(goal): 合并 ${request.goalId}`,
        "-m",
        `Tasks: ${request.taskId}`,
        goal,
      ],
      root,
    );
    if (!successful(merged)) {
      await this.git.run(["merge", "--abort"], root);
      if (originalBranch !== main)
        await this.git.run(["switch", originalBranch], root);
      return failure(
        "merge_conflict",
        "The goal branch could not be merged into main.",
        commandDetails(merged),
      );
    }
    const mergedHead = await this.git.run(["rev-parse", "HEAD"], root);
    if (!successful(mergedHead) || mergedHead.stdout.trim().length === 0) {
      return failure(
        "git_failed",
        "The merge commit hash could not be read.",
        commandDetails(mergedHead),
      );
    }
    return {
      ok: true,
      value: {
        goalId: request.goalId,
        goalBranch: goal,
        mainBranch: main,
        commit: mergedHead.stdout.trim(),
        previousMain: mainHead.stdout.trim(),
      },
    };
  }
}

export { GitTaskDeliveryService as TaskDeliveryService };
export { GitGoalMergeService as GoalMergeService };
