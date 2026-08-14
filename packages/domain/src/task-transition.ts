import type { Task, TaskStatus } from "./task.js";
import { hasText, recordFailure } from "./record.js";
import type { DomainResult } from "./workflow.js";

const TASK_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  draft: ["ready", "cancelled"],
  ready: ["in_progress", "paused", "cancelled"],
  in_progress: ["in_review", "blocked", "paused", "cancelled"],
  in_review: ["completed", "changes_requested", "paused", "cancelled"],
  changes_requested: ["in_progress", "paused", "cancelled"],
  blocked: ["in_progress", "paused", "cancelled"],
  paused: ["in_progress", "cancelled"],
  completed: [],
  cancelled: [],
};

export type TaskTransitionAudit = Readonly<{
  readonly taskId: Task["id"];
  readonly fromStatus: TaskStatus;
  readonly toStatus: TaskStatus;
  readonly reason: string;
}>;

export type TaskTransitionResult = Readonly<{
  readonly task: Task;
  readonly audit: TaskTransitionAudit;
}>;

function requiresReason(status: TaskStatus): boolean {
  return (
    status === "blocked" ||
    status === "changes_requested" ||
    status === "paused" ||
    status === "cancelled"
  );
}

export function canTransitionTask(
  fromStatus: TaskStatus,
  toStatus: TaskStatus,
): boolean {
  return TASK_TRANSITIONS[fromStatus].includes(toStatus);
}

export function transitionTask(
  task: Task,
  toStatus: TaskStatus,
  reason = "",
): DomainResult<TaskTransitionResult> {
  if (!canTransitionTask(task.status, toStatus)) {
    return recordFailure(
      "invalid_task_transition",
      `Task cannot transition from ${task.status} to ${toStatus}.`,
    );
  }
  if (requiresReason(toStatus) && !hasText(reason)) {
    return recordFailure(
      "reason_required",
      `A reason is required when transitioning to ${toStatus}.`,
    );
  }

  const audit: TaskTransitionAudit = {
    taskId: task.id,
    fromStatus: task.status,
    toStatus,
    reason: reason.trim(),
  };
  return {
    ok: true,
    value: { task: { ...task, status: toStatus }, audit },
  };
}
