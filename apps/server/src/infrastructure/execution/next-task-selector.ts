import type { GoalId, TaskId } from "@personal-ai-operator/contracts";

import { GoalService, type GoalSnapshot } from "../goals/goal-service.js";
import { IssueService, type IssuePage } from "../issues/issue-service.js";
import { TaskService, type TaskSnapshot } from "../tasks/task-service.js";

export type NextTaskSelectorErrorCode =
  | "registry_failed"
  | "project_not_found"
  | "goal_not_found"
  | "goal_not_approved"
  | "no_ready_task";

export type NextTaskSelectorError = Readonly<{
  readonly code: NextTaskSelectorErrorCode;
  readonly message: string;
  readonly details: readonly string[];
}>;

export type NextTaskSelectorResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: NextTaskSelectorError }>;

export type NextTaskCandidate = Readonly<{
  readonly task: TaskSnapshot;
  readonly goal: GoalSnapshot;
}>;

export type NextTaskSelectorOptions = Readonly<{
  readonly taskService?: TaskService;
  readonly goalService?: GoalService;
  readonly issueService?: IssueService;
}>;

function failure<Value>(
  code: NextTaskSelectorErrorCode,
  message: string,
  details: readonly string[] = [],
): NextTaskSelectorResult<Value> {
  return { ok: false, error: { code, message, details } };
}

function isBlockingIssue(
  issue: IssuePage["issues"][number]["issue"],
  task: TaskSnapshot["task"],
): boolean {
  if (issue.status !== "in_progress") return false;
  if (issue.severity === "blocker") return true;
  if (issue.impact === "unknown" || issue.impact === "execution_chain") {
    return true;
  }
  if (issue.impact === "task") return issue.affectedTaskIds.includes(task.id);
  return issue.affectedObjectIds.includes(task.goalId);
}

function decisionBlocks(
  decision: IssuePage["decisions"][number]["decision"],
  blockingIssueIds: readonly string[],
  task: TaskSnapshot["task"],
): boolean {
  if (decision.status !== "draft") return false;
  return (
    (decision.sourceIssueId !== null &&
      blockingIssueIds.includes(decision.sourceIssueId)) ||
    decision.relatedObjectIds.includes(task.id) ||
    decision.relatedObjectIds.includes(task.goalId)
  );
}

export class NextTaskSelectorService {
  private readonly taskService: TaskService;
  private readonly goalService: GoalService;
  private readonly issueService: IssueService;

  public constructor(options: NextTaskSelectorOptions = {}) {
    this.taskService = options.taskService ?? new TaskService();
    this.goalService = options.goalService ?? new GoalService();
    this.issueService = options.issueService ?? new IssueService();
  }

  public async select(
    projectKey: string,
    goalId: GoalId,
    currentTaskId?: TaskId,
  ): Promise<NextTaskSelectorResult<NextTaskCandidate>> {
    const [tasks, goals, issues] = await Promise.all([
      this.taskService.getTasks(projectKey),
      this.goalService.getGoals(projectKey),
      this.issueService.getIssues(projectKey),
    ]);
    if (!tasks.ok)
      return failure(
        tasks.error.code === "registry_failed"
          ? "registry_failed"
          : tasks.error.code === "project_not_found"
            ? "project_not_found"
            : "no_ready_task",
        tasks.error.message,
        tasks.error.details,
      );
    if (!goals.ok)
      return failure(
        goals.error.code === "registry_failed"
          ? "registry_failed"
          : goals.error.code === "project_not_found"
            ? "project_not_found"
            : "goal_not_found",
        goals.error.message,
        goals.error.details,
      );
    if (!issues.ok)
      return failure(
        issues.error.code === "registry_failed"
          ? "registry_failed"
          : issues.error.code === "project_not_found"
            ? "project_not_found"
            : "no_ready_task",
        issues.error.message,
        issues.error.details,
      );

    const goal = goals.value.goals.find((item) => item.goal.id === goalId);
    if (goal === undefined)
      return failure("goal_not_found", "The task goal was not found.");
    if (
      goal.goal.approval?.approved !== true ||
      (goal.goal.status !== "ready" && goal.goal.status !== "in_progress")
    ) {
      return failure(
        "goal_not_approved",
        "Automatic task progression requires an approved active goal.",
      );
    }

    const taskMap = new Map(
      tasks.value.tasks.map((item) => [item.task.id, item.task]),
    );
    const candidates = tasks.value.tasks
      .filter(
        (item) =>
          item.task.goalId === goalId &&
          item.task.status === "ready" &&
          item.task.id !== currentTaskId,
      )
      .toSorted((left, right) => left.task.id.localeCompare(right.task.id));
    const rejected: string[] = [];
    for (const candidate of candidates) {
      const incomplete = candidate.task.dependencies.filter(
        (dependency) => taskMap.get(dependency)?.status !== "completed",
      );
      if (incomplete.length > 0) {
        rejected.push(
          `${candidate.task.id}: dependencies ${incomplete.join(", ")}`,
        );
        continue;
      }
      const blockingIssues = issues.value.issues.filter((item) =>
        isBlockingIssue(item.issue, candidate.task),
      );
      if (blockingIssues.length > 0) {
        rejected.push(
          `${candidate.task.id}: issues ${blockingIssues.map((item) => item.issue.id).join(", ")}`,
        );
        continue;
      }
      const blockingIssueIds = blockingIssues.map((item) => item.issue.id);
      const pendingDecisions = issues.value.decisions.filter((item) =>
        decisionBlocks(item.decision, blockingIssueIds, candidate.task),
      );
      if (pendingDecisions.length > 0) {
        rejected.push(
          `${candidate.task.id}: decisions ${pendingDecisions.map((item) => item.decision.id).join(", ")}`,
        );
        continue;
      }
      return { ok: true, value: { task: candidate, goal } };
    }
    return failure(
      "no_ready_task",
      "No next task satisfies the approved goal, dependency, issue, and decision gates.",
      rejected,
    );
  }
}
