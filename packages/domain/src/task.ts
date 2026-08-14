import type {
  DecisionId,
  GoalId,
  TaskId,
} from "@personal-ai-operator/contracts";

import {
  type CustomFieldDefinition,
  type CustomFieldValues,
  validateCustomFieldValues,
} from "./custom-field.js";
import { isApprovedGoal, type Goal } from "./goal.js";
import { getRole, type RoleKey } from "./role.js";
import type { DomainError, DomainResult } from "./workflow.js";

export type TaskRun = Readonly<{
  readonly mode: string;
  readonly gitBranch: string;
  readonly worktree: string;
  readonly verificationCommands: readonly string[];
}>;

export type TaskCompletion = Readonly<{
  readonly output: string;
  readonly tests: readonly string[];
  readonly commit?: string;
  readonly outstandingIssues: readonly string[];
  readonly handoff: string;
}>;

export type Task = Readonly<{
  readonly id: TaskId;
  readonly title: string;
  readonly status:
    | "draft"
    | "ready"
    | "in_progress"
    | "in_review"
    | "completed"
    | "blocked"
    | "changes_requested"
    | "paused"
    | "cancelled";
  readonly goalId: GoalId;
  readonly currentRole: RoleKey;
  readonly dependencies: readonly TaskId[];
  readonly purpose: string;
  readonly scope: readonly string[];
  readonly outputs: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly requiredFiles: readonly string[];
  readonly onDemandFiles: readonly string[];
  readonly associatedDecisions: readonly DecisionId[];
  readonly allowedPaths: readonly string[];
  readonly forbiddenPaths: readonly string[];
  readonly run: TaskRun;
  readonly evidence: readonly string[];
  readonly customFieldDefinitions: readonly CustomFieldDefinition[];
  readonly customFields: CustomFieldValues;
  readonly completion: TaskCompletion;
}>;

export type TaskInput = Readonly<{
  readonly id: TaskId;
  readonly title: string;
  readonly currentRole: RoleKey;
  readonly dependencies: readonly TaskId[];
  readonly purpose: string;
  readonly scope: readonly string[];
  readonly outputs: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly requiredFiles: readonly string[];
  readonly onDemandFiles: readonly string[];
  readonly associatedDecisions: readonly DecisionId[];
  readonly allowedPaths: readonly string[];
  readonly forbiddenPaths: readonly string[];
  readonly run: TaskRun;
  readonly evidence: readonly string[];
  readonly customFieldDefinitions?: readonly CustomFieldDefinition[];
  readonly customFields?: CustomFieldValues;
  readonly completion: TaskCompletion;
}>;

export type TaskPatch = Readonly<{
  readonly title?: string;
  readonly currentRole?: RoleKey;
  readonly purpose?: string;
  readonly scope?: readonly string[];
  readonly outputs?: readonly string[];
  readonly acceptanceCriteria?: readonly string[];
  readonly requiredFiles?: readonly string[];
  readonly onDemandFiles?: readonly string[];
  readonly associatedDecisions?: readonly DecisionId[];
  readonly allowedPaths?: readonly string[];
  readonly forbiddenPaths?: readonly string[];
  readonly run?: TaskRun;
  readonly evidence?: readonly string[];
  readonly customFieldDefinitions?: readonly CustomFieldDefinition[];
  readonly customFields?: CustomFieldValues;
  readonly completion?: TaskCompletion;
}>;

function taskError(
  code: "invalid_task" | "goal_not_approved",
  message: string,
): DomainResult<never> {
  const error: DomainError = { code, message };
  return { ok: false, error };
}

function hasContent(values: readonly string[]): boolean {
  return values.every((value) => value.trim().length > 0);
}

function hasRequiredContent(values: readonly string[]): boolean {
  return values.length > 0 && hasContent(values);
}

function validRun(run: TaskRun): boolean {
  return (
    run.mode.trim().length > 0 &&
    run.gitBranch.trim().length > 0 &&
    run.worktree.trim().length > 0 &&
    run.verificationCommands.length > 0 &&
    hasContent(run.verificationCommands)
  );
}

function validCompletion(completion: TaskCompletion): boolean {
  return (
    completion.output.trim().length > 0 &&
    hasRequiredContent(completion.tests) &&
    hasContent(completion.outstandingIssues) &&
    completion.handoff.trim().length > 0
  );
}

function validInput(input: TaskInput): boolean {
  return (
    input.title.trim().length > 0 &&
    input.purpose.trim().length > 0 &&
    hasRequiredContent(input.scope) &&
    hasRequiredContent(input.outputs) &&
    hasRequiredContent(input.acceptanceCriteria) &&
    hasRequiredContent(input.requiredFiles) &&
    hasRequiredContent(input.onDemandFiles) &&
    hasRequiredContent(input.allowedPaths) &&
    hasRequiredContent(input.forbiddenPaths) &&
    hasRequiredContent(input.evidence) &&
    validRun(input.run) &&
    validCompletion(input.completion) &&
    getRole(input.currentRole) !== undefined
  );
}

export function createTaskDraft(
  goal: Goal,
  input: TaskInput,
): DomainResult<Task> {
  if (!validInput(input)) {
    return taskError("invalid_task", "Task required fields are incomplete.");
  }

  const definitions = input.customFieldDefinitions ?? [];
  const fields = input.customFields ?? {};
  const validatedFields = validateCustomFieldValues(definitions, fields);
  if (!validatedFields.ok) {
    return validatedFields;
  }

  return {
    ok: true,
    value: {
      id: input.id,
      title: input.title.trim(),
      status: "draft",
      goalId: goal.id,
      currentRole: input.currentRole,
      dependencies: [...input.dependencies],
      purpose: input.purpose.trim(),
      scope: input.scope.map((item) => item.trim()),
      outputs: input.outputs.map((item) => item.trim()),
      acceptanceCriteria: input.acceptanceCriteria.map((item) => item.trim()),
      requiredFiles: input.requiredFiles.map((item) => item.trim()),
      onDemandFiles: input.onDemandFiles.map((item) => item.trim()),
      associatedDecisions: [...input.associatedDecisions],
      allowedPaths: input.allowedPaths.map((item) => item.trim()),
      forbiddenPaths: input.forbiddenPaths.map((item) => item.trim()),
      run: {
        ...input.run,
        mode: input.run.mode.trim(),
        gitBranch: input.run.gitBranch.trim(),
        worktree: input.run.worktree.trim(),
        verificationCommands: input.run.verificationCommands.map((item) =>
          item.trim(),
        ),
      },
      evidence: input.evidence.map((item) => item.trim()),
      customFieldDefinitions: [...definitions],
      customFields: validatedFields.value,
      completion: { ...input.completion },
    },
  };
}

export function markTaskReady(goal: Goal, task: Task): DomainResult<Task> {
  if (task.goalId !== goal.id) {
    return taskError(
      "invalid_task",
      "Task does not belong to the supplied goal.",
    );
  }
  if (!isApprovedGoal(goal)) {
    return taskError(
      "goal_not_approved",
      "An unapproved goal cannot produce an executable task.",
    );
  }
  if (task.status !== "draft" && task.status !== "changes_requested") {
    return taskError("invalid_task", "Only a draft task can become ready.");
  }

  return { ok: true, value: { ...task, status: "ready" } };
}

export function updateTask(task: Task, patch: TaskPatch): DomainResult<Task> {
  if (patch.title !== undefined && patch.title.trim().length === 0) {
    return taskError("invalid_task", "Task title cannot be empty.");
  }
  if (
    patch.currentRole !== undefined &&
    getRole(patch.currentRole) === undefined
  ) {
    return taskError("invalid_task", "Task role is not defined.");
  }

  const nextTask: Task = { ...task, ...patch };
  if (
    nextTask.purpose.trim().length === 0 ||
    !hasRequiredContent(nextTask.scope) ||
    !hasRequiredContent(nextTask.outputs) ||
    !hasRequiredContent(nextTask.acceptanceCriteria) ||
    !hasRequiredContent(nextTask.requiredFiles) ||
    !hasRequiredContent(nextTask.onDemandFiles) ||
    !hasRequiredContent(nextTask.allowedPaths) ||
    !hasRequiredContent(nextTask.forbiddenPaths) ||
    !hasRequiredContent(nextTask.evidence) ||
    !validRun(nextTask.run) ||
    !validCompletion(nextTask.completion)
  ) {
    return taskError("invalid_task", "Task required fields cannot be removed.");
  }

  const validatedFields = validateCustomFieldValues(
    nextTask.customFieldDefinitions,
    nextTask.customFields,
  );
  if (!validatedFields.ok) {
    return validatedFields;
  }

  return {
    ok: true,
    value: { ...nextTask, customFields: validatedFields.value },
  };
}

export function isExecutableTask(task: Task): boolean {
  return task.status === "ready" || task.status === "in_progress";
}
