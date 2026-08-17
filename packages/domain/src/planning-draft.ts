import {
  parseFormalId,
  type GoalId,
  type TaskId,
} from "@personal-ai-operator/contracts";

import { getRole, type Role, type RoleKey } from "./role.js";

export type PlanningGoalDraft = Readonly<{
  readonly id: GoalId;
  readonly title: string;
  readonly boundary: readonly string[];
  readonly risks: readonly string[];
  readonly acceptanceCriteria: readonly string[];
}>;

export type PlanningRoleDraft = Role;

export type PlanningTaskDraft = Readonly<{
  readonly id: TaskId;
  readonly title: string;
  readonly goalId: GoalId;
  readonly currentRole: RoleKey;
  readonly dependencies: readonly TaskId[];
  readonly purpose: string;
  readonly scope: readonly string[];
  readonly outputs: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly requiredFiles: readonly string[];
  readonly onDemandFiles: readonly string[];
  readonly allowedPaths: readonly string[];
  readonly forbiddenPaths: readonly string[];
  readonly verificationCommands: readonly string[];
}>;

export type PlanningDraft = Readonly<{
  readonly schemaVersion: 1;
  readonly kind: "planning_draft";
  readonly specRevision: number;
  readonly specHash: string;
  readonly goalDrafts: readonly PlanningGoalDraft[];
  readonly roleDrafts: readonly PlanningRoleDraft[];
  readonly taskDrafts: readonly PlanningTaskDraft[];
  readonly dependencyGraph: Readonly<Record<string, readonly string[]>>;
  readonly handoff: string;
}>;

export type PlanningDraftErrorCode =
  | "invalid_planning_draft"
  | "missing_dependency"
  | "duplicate_id"
  | "circular_dependency"
  | "invalid_path"
  | "unknown_role";

export type PlanningDraftError = Readonly<{
  readonly code: PlanningDraftErrorCode;
  readonly message: string;
}>;

export type PlanningDraftResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: PlanningDraftError }>;

function failure<Value>(
  code: PlanningDraftErrorCode,
  message: string,
): PlanningDraftResult<Value> {
  return { ok: false, error: { code, message } };
}

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function nonEmptyList(value: readonly string[]): boolean {
  return value.length > 0 && value.every(nonEmpty);
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function isSafeRelativePath(value: string): boolean {
  const path = value.trim().replaceAll("\\", "/");
  if (path.length === 0 || path.startsWith("/") || /^[A-Za-z]:\//.test(path)) {
    return false;
  }
  return !path.split("/").some((part) => part === ".." || part.length === 0);
}

function validFormalId(value: string, prefix: "GOAL" | "TASK"): boolean {
  try {
    const parsed = parseFormalId(value);
    return parsed === value && parsed.startsWith(`${prefix}-`);
  } catch {
    return false;
  }
}

function validGoalDraft(goal: PlanningGoalDraft): boolean {
  return (
    validFormalId(goal.id, "GOAL") &&
    nonEmpty(goal.title) &&
    nonEmptyList(goal.boundary) &&
    goal.risks.every(nonEmpty) &&
    nonEmptyList(goal.acceptanceCriteria)
  );
}

function validRoleDraft(role: PlanningRoleDraft): boolean {
  return (
    getRole(role.key) !== undefined &&
    nonEmpty(role.title) &&
    nonEmptyList(role.responsibilities) &&
    nonEmptyList(role.mustRead) &&
    role.onDemandRead.every(nonEmpty) &&
    nonEmptyList(role.allowedActions) &&
    nonEmptyList(role.forbiddenActions) &&
    nonEmptyList(role.handoff)
  );
}

function validTaskDraft(
  task: PlanningTaskDraft,
  goalIds: ReadonlySet<string>,
  taskIds: ReadonlySet<string>,
): PlanningDraftErrorCode | null {
  if (getRole(task.currentRole) === undefined) return "unknown_role";
  if (
    !validFormalId(task.id, "TASK") ||
    !nonEmpty(task.title) ||
    !goalIds.has(task.goalId) ||
    !nonEmpty(task.purpose) ||
    !nonEmptyList(task.scope) ||
    !nonEmptyList(task.outputs) ||
    !nonEmptyList(task.acceptanceCriteria) ||
    !nonEmptyList(task.requiredFiles) ||
    !nonEmptyList(task.onDemandFiles) ||
    !nonEmptyList(task.allowedPaths) ||
    !nonEmptyList(task.forbiddenPaths) ||
    !nonEmptyList(task.verificationCommands)
  ) {
    return "invalid_planning_draft";
  }
  if (
    [
      ...task.requiredFiles,
      ...task.onDemandFiles,
      ...task.allowedPaths,
      ...task.forbiddenPaths,
    ].some((path) => !isSafeRelativePath(path))
  ) {
    return "invalid_path";
  }
  if (!task.dependencies.every((dependency) => taskIds.has(dependency))) {
    return "missing_dependency";
  }
  if (task.dependencies.includes(task.id)) return "circular_dependency";
  return null;
}

function hasCycle(tasks: readonly PlanningTaskDraft[]): boolean {
  const graph = new Map<string, readonly string[]>(
    tasks.map((task) => [task.id, task.dependencies]),
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of graph.get(id) ?? []) {
      if (visit(dependency)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return tasks.some((task) => visit(task.id));
}

export function validatePlanningDraft(
  draft: PlanningDraft,
): PlanningDraftResult<PlanningDraft> {
  if (
    draft.schemaVersion !== 1 ||
    draft.kind !== "planning_draft" ||
    !Number.isInteger(draft.specRevision) ||
    draft.specRevision < 1 ||
    !nonEmpty(draft.specHash) ||
    !nonEmpty(draft.handoff) ||
    draft.goalDrafts.length === 0 ||
    draft.roleDrafts.length === 0 ||
    draft.taskDrafts.length === 0
  ) {
    return failure(
      "invalid_planning_draft",
      "Planning draft metadata and collections are required.",
    );
  }
  const goalIds = draft.goalDrafts.map((goal) => goal.id);
  const taskIds = draft.taskDrafts.map((task) => task.id);
  const roleKeys = draft.roleDrafts.map((role) => role.key);
  if (!unique(goalIds) || !unique(taskIds) || !unique(roleKeys)) {
    return failure(
      "duplicate_id",
      "Planning draft IDs and role keys must be unique.",
    );
  }
  if (!draft.goalDrafts.every(validGoalDraft)) {
    return failure("invalid_planning_draft", "A goal draft is invalid.");
  }
  if (!draft.roleDrafts.every(validRoleDraft)) {
    return failure("unknown_role", "A role draft is unknown or incomplete.");
  }
  const goalSet = new Set(goalIds);
  const taskSet = new Set<string>(taskIds);
  for (const task of draft.taskDrafts) {
    const error = validTaskDraft(task, goalSet, taskSet);
    if (error !== null) {
      return failure(
        error,
        `Task draft ${task.id} failed planning validation.`,
      );
    }
  }
  if (hasCycle(draft.taskDrafts)) {
    return failure(
      "circular_dependency",
      "Planning task dependencies contain a cycle.",
    );
  }
  const graphKeys = Object.keys(draft.dependencyGraph);
  if (!unique(graphKeys) || graphKeys.some((id) => !taskSet.has(id))) {
    return failure(
      "invalid_planning_draft",
      "Dependency graph contains an unknown task.",
    );
  }
  for (const task of draft.taskDrafts) {
    const dependencies = draft.dependencyGraph[task.id];
    if (
      dependencies === undefined ||
      dependencies.length !== task.dependencies.length ||
      dependencies.some(
        (dependency) => !new Set<string>(task.dependencies).has(dependency),
      )
    ) {
      return failure(
        "invalid_planning_draft",
        "Dependency graph does not match task dependencies.",
      );
    }
  }
  return {
    ok: true,
    value: {
      ...draft,
      specHash: draft.specHash.trim(),
      handoff: draft.handoff.trim(),
    },
  };
}

export function firstDependencyFreeTask(draft: PlanningDraft): TaskId | null {
  const validated = validatePlanningDraft(draft);
  if (!validated.ok) return null;
  return (
    validated.value.taskDrafts.find((task) => task.dependencies.length === 0)
      ?.id ?? null
  );
}

export function cloneRole(role: Role): PlanningRoleDraft {
  return {
    ...role,
    responsibilities: [...role.responsibilities],
    mustRead: [...role.mustRead],
    onDemandRead: [...role.onDemandRead],
    allowedActions: [...role.allowedActions],
    forbiddenActions: [...role.forbiddenActions],
    handoff: [...role.handoff],
  };
}
