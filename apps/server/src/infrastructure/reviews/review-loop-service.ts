import type {
  ReportId,
  ReviewReport,
  TaskId,
} from "@personal-ai-operator/contracts";
import {
  completeTaskIfEligible,
  type CompletionEvidence,
} from "@personal-ai-operator/domain";

import { ApprovalService } from "../approvals/approval-service.js";
import {
  ExecutionCoordinatorService,
  type ExecutionStartResult,
} from "../execution/execution-coordinator.js";
import { NextTaskSelectorService } from "../execution/next-task-selector.js";
import { GoalService } from "../goals/goal-service.js";
import { IssueService } from "../issues/issue-service.js";
import {
  ReviewService,
  type ReviewInput,
  type ReviewResult,
} from "./review-service.js";
import { TaskService, type TaskSnapshot } from "../tasks/task-service.js";

export type ReviewLoopState =
  "changes_requested" | "blocked" | "waiting_for_approval" | "completed";

export type ReviewLoopValue = Readonly<{
  readonly state: ReviewLoopState;
  readonly report: ReviewReport;
  readonly task: TaskSnapshot;
  readonly nextTask: TaskSnapshot | null;
  readonly nextTaskReason:
    "rework_required" | "waiting_for_approval" | "selected" | "none";
  readonly nextTaskDetails: readonly string[];
}>;

export type ReviewLoopResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: ReviewLoopError }>;

export type ReviewLoopErrorCode =
  | "invalid_input"
  | "project_not_found"
  | "task_not_found"
  | "review_not_found"
  | "review_chain_invalid"
  | "transition_failed"
  | "approval_failed"
  | "runtime_failed"
  | "no_next_task";

export type ReviewLoopError = Readonly<{
  readonly code: ReviewLoopErrorCode;
  readonly message: string;
  readonly details: readonly string[];
}>;

export type ReviewLoopOptions = Readonly<{
  readonly reviewService?: ReviewService;
  readonly taskService?: TaskService;
  readonly goalService?: GoalService;
  readonly issueService?: IssueService;
  readonly approvalService?: ApprovalService;
  readonly executionCoordinator?: ExecutionCoordinatorService;
  readonly nextTaskSelector?: NextTaskSelectorService;
}>;

export type ReworkInput = Readonly<{
  readonly projectKey: string;
  readonly taskId: TaskId;
  readonly previousReportId: ReportId;
  readonly prompt?: string;
}>;

export type ReworkResult = Readonly<{
  readonly previousReportId: ReportId;
  readonly execution: ExecutionStartResult;
}>;

function failure<Value>(
  code: ReviewLoopErrorCode,
  message: string,
  details: readonly string[] = [],
): ReviewLoopResult<Value> {
  return { ok: false, error: { code, message, details } };
}

function mapReviewError<Value>(
  result: ReviewResult<Value>,
): ReviewLoopResult<Value> {
  if (result.ok) return result;
  const code: ReviewLoopErrorCode =
    result.error.code === "project_not_found"
      ? "project_not_found"
      : result.error.code === "task_not_found"
        ? "task_not_found"
        : result.error.code === "review_chain_invalid"
          ? "review_chain_invalid"
          : result.error.code === "runtime_failed" ||
              result.error.code === "audit_failed"
            ? "runtime_failed"
            : "review_not_found";
  return failure(code, result.error.message, result.error.details);
}

function completionEvidence(report: ReviewReport): CompletionEvidence {
  return {
    actualOutputs: report.files
      .filter((file) => file.exists)
      .map((file) => file.path),
    commandsRun: report.tests.map((test) => test.command),
    verificationEvidence: report.verificationEvidence,
    gitDiffReference: `${report.diff.beforeHead}..${report.diff.afterHead}`,
    allowedPathsVerified: report.diff.passed,
    verificationPassed: report.tests.every(
      (test) => test.exitCode === 0 && test.error === null,
    ),
    unresolvedViolations: report.diff.violations.map(
      (violation) => violation.message,
    ),
    reviewerApproved: report.decision === "accepted",
  };
}

function valueFrom(
  state: ReviewLoopState,
  report: ReviewReport,
  task: TaskSnapshot,
  nextTask: TaskSnapshot | null,
  nextTaskReason: ReviewLoopValue["nextTaskReason"],
  nextTaskDetails: readonly string[] = [],
): ReviewLoopValue {
  return {
    state,
    report,
    task,
    nextTask,
    nextTaskReason,
    nextTaskDetails,
  };
}

export class ReviewLoopService {
  private readonly reviewService: ReviewService;
  private readonly taskService: TaskService;
  private readonly goalService: GoalService;
  private readonly issueService: IssueService;
  private readonly approvalService: ApprovalService;
  private readonly executionCoordinator: ExecutionCoordinatorService;
  private readonly nextTaskSelector: NextTaskSelectorService;

  public constructor(options: ReviewLoopOptions = {}) {
    this.taskService = options.taskService ?? new TaskService();
    this.goalService = options.goalService ?? new GoalService();
    this.issueService = options.issueService ?? new IssueService();
    this.approvalService = options.approvalService ?? new ApprovalService();
    this.reviewService = options.reviewService ?? new ReviewService();
    this.executionCoordinator =
      options.executionCoordinator ??
      new ExecutionCoordinatorService({
        taskService: this.taskService,
        goalService: this.goalService,
        issueService: this.issueService,
      });
    this.nextTaskSelector =
      options.nextTaskSelector ??
      new NextTaskSelectorService({
        taskService: this.taskService,
        goalService: this.goalService,
        issueService: this.issueService,
      });
  }

  public async review(
    input: ReviewInput,
  ): Promise<ReviewLoopResult<ReviewLoopValue>> {
    const reviewed = await this.reviewService.review(input);
    if (!reviewed.ok) return mapReviewError(reviewed);
    const tasks = await this.taskService.getTasks(input.projectKey);
    if (!tasks.ok)
      return failure(
        tasks.error.code === "project_not_found"
          ? "project_not_found"
          : "runtime_failed",
        tasks.error.message,
        tasks.error.details,
      );
    const current = tasks.value.tasks.find(
      (item) => item.task.id === input.taskId,
    );
    if (current === undefined)
      return failure("task_not_found", "The reviewed task was not found.");

    if (reviewed.value.decision === "changes_requested") {
      const transitioned = await this.taskService.transition({
        projectKey: input.projectKey,
        taskId: current.task.id,
        toStatus: "changes_requested",
        reason: `Review ${reviewed.value.id} requested changes: ${reviewed.value.requiredChanges.join("; ") || "inspect the findings"}`,
        revision: current.revision,
        hash: current.hash,
        actor: "reviewer",
      });
      if (!transitioned.ok)
        return failure(
          "transition_failed",
          transitioned.error.message,
          transitioned.error.details,
        );
      return {
        ok: true,
        value: valueFrom(
          "changes_requested",
          reviewed.value,
          transitioned.value,
          null,
          "rework_required",
        ),
      };
    }

    if (reviewed.value.decision === "blocked") {
      const transitioned = await this.taskService.transition({
        projectKey: input.projectKey,
        taskId: current.task.id,
        toStatus: "blocked",
        reason: `Review ${reviewed.value.id} blocked the task.`,
        revision: current.revision,
        hash: current.hash,
        actor: "reviewer",
      });
      if (!transitioned.ok)
        return failure(
          "transition_failed",
          transitioned.error.message,
          transitioned.error.details,
        );
      return {
        ok: true,
        value: valueFrom(
          "blocked",
          reviewed.value,
          transitioned.value,
          null,
          "none",
        ),
      };
    }

    return this.advanceAccepted(input.projectKey, reviewed.value, current);
  }

  public async rework(
    input: ReworkInput,
  ): Promise<ReviewLoopResult<ReworkResult>> {
    const previous = await this.reviewService.get(
      input.projectKey,
      input.previousReportId,
    );
    if (!previous.ok) return mapReviewError(previous);
    if (
      previous.value.decision !== "changes_requested" ||
      previous.value.taskId !== input.taskId
    ) {
      return failure(
        "review_chain_invalid",
        "Rework must reference a changes_requested report for the same task.",
      );
    }
    const started = await this.executionCoordinator.start({
      projectKey: input.projectKey,
      taskId: input.taskId,
      rework: true,
      ...(input.prompt === undefined ? {} : { prompt: input.prompt }),
    });
    if (!started.ok)
      return failure(
        started.error.code === "project_not_found"
          ? "project_not_found"
          : started.error.code === "task_not_found"
            ? "task_not_found"
            : "runtime_failed",
        started.error.message,
        started.error.details,
      );
    return {
      ok: true,
      value: {
        previousReportId: input.previousReportId,
        execution: started.value,
      },
    };
  }

  public async advance(
    input: Readonly<{
      readonly projectKey: string;
      readonly taskId: TaskId;
      readonly reportId: ReportId;
    }>,
  ): Promise<ReviewLoopResult<ReviewLoopValue>> {
    const report = await this.reviewService.get(
      input.projectKey,
      input.reportId,
    );
    if (!report.ok) return mapReviewError(report);
    if (
      report.value.taskId !== input.taskId ||
      report.value.decision !== "accepted"
    )
      return failure(
        "review_chain_invalid",
        "Only an accepted report for the same task can advance the review loop.",
      );
    const tasks = await this.taskService.getTasks(input.projectKey);
    if (!tasks.ok)
      return failure(
        "runtime_failed",
        tasks.error.message,
        tasks.error.details,
      );
    const current = tasks.value.tasks.find(
      (item) => item.task.id === input.taskId,
    );
    if (current === undefined)
      return failure("task_not_found", "The reviewed task was not found.");
    return this.advanceAccepted(input.projectKey, report.value, current);
  }

  private async advanceAccepted(
    projectKey: string,
    report: ReviewReport,
    current: TaskSnapshot,
  ): Promise<ReviewLoopResult<ReviewLoopValue>> {
    const [goals, issues, approvals] = await Promise.all([
      this.goalService.getGoals(projectKey),
      this.issueService.getIssues(projectKey),
      this.approvalService.getApprovals(projectKey),
    ]);
    if (!goals.ok || !issues.ok || !approvals.ok)
      return failure(
        "approval_failed",
        "The review loop could not load completion gates.",
        [
          ...(goals.ok ? [] : goals.error.details),
          ...(issues.ok ? [] : issues.error.details),
          ...(approvals.ok ? [] : approvals.error.details),
        ],
      );
    const goal = goals.value.goals.find(
      (item) => item.goal.id === current.task.goalId,
    );
    if (goal === undefined)
      return failure("project_not_found", "The task goal was not found.");
    const completion = completeTaskIfEligible({
      goal: goal.goal,
      task: current.task,
      approvals: approvals.value.approvals.map((item) => item.approval),
      blockingIssues: issues.value.issues.map((item) => item.issue),
      evidence: completionEvidence(report),
    });
    if (!completion.ok) {
      const nextTaskDetails = [completion.error.message];
      return {
        ok: true,
        value: valueFrom(
          "waiting_for_approval",
          report,
          current,
          null,
          "waiting_for_approval",
          nextTaskDetails,
        ),
      };
    }
    const transitioned = await this.taskService.transition({
      projectKey,
      taskId: current.task.id,
      toStatus: "completed",
      reason: `Review ${report.id} accepted and completion evidence passed.`,
      revision: current.revision,
      hash: current.hash,
      actor: "reviewer",
    });
    if (!transitioned.ok)
      return failure(
        "transition_failed",
        transitioned.error.message,
        transitioned.error.details,
      );
    const next = await this.nextTaskSelector.select(
      projectKey,
      transitioned.value.task.goalId,
      transitioned.value.task.id,
    );
    if (!next.ok) {
      return {
        ok: true,
        value: valueFrom(
          "completed",
          report,
          transitioned.value,
          null,
          "none",
          next.error.details.length > 0
            ? next.error.details
            : [next.error.message],
        ),
      };
    }
    return {
      ok: true,
      value: valueFrom(
        "completed",
        report,
        transitioned.value,
        next.value.task,
        "selected",
      ),
    };
  }
}
