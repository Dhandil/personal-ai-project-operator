import { readdir } from "node:fs/promises";

import {
  createCustomFieldDefinition,
  createTaskDraft,
  getRole,
  markTaskReady,
  transitionTask,
  updateTask,
  type CustomFieldDefinition,
  type CustomFieldValues,
  type Goal,
  type RoleKey,
  type Task,
  type TaskCompletion,
  type TaskInput,
  type TaskPatch,
  type TaskRun,
  type TaskStatus,
} from "@personal-ai-operator/domain";
import {
  parseFormalId,
  parseUtcIsoTimestamp,
  type DecisionId,
  type GoalId,
  type ExecutionId,
  type TaskId,
  type UtcIsoTimestamp,
} from "@personal-ai-operator/contracts";

import { createAuditEvent } from "../audit/audit-event.js";
import { AuditLogRepository } from "../audit/audit-log-repository.js";
import { GovernanceRepository } from "../files/governance-repository.js";
import type { GovernanceDocument } from "../files/governance-codec.js";
import {
  ProjectRegistryRepository,
  type ProjectIndexRecord,
} from "../registry/project-registry-repository.js";
import type { ProjectRegistryFactory } from "../projects/project-startup.js";

export type TaskSnapshot = Readonly<{
  readonly task: Task;
  readonly revision: number;
  readonly hash: string;
}>;
export type TaskPage = Readonly<{
  readonly projectKey: string;
  readonly projectRoot: string;
  readonly tasks: readonly TaskSnapshot[];
}>;
export type TaskServiceOptions = Readonly<{
  readonly registryFactory?: ProjectRegistryFactory;
  readonly now?: () => UtcIsoTimestamp;
}>;
export type TaskErrorCode =
  | "invalid_input"
  | "registry_failed"
  | "project_not_found"
  | "goal_not_found"
  | "invalid_goal"
  | "invalid_task"
  | "invalid_task_transition"
  | "invalid_dependency"
  | "circular_dependency"
  | "task_not_found"
  | "revision_mismatch"
  | "write_failed"
  | "audit_failed";
export type TaskError = Readonly<{
  readonly code: TaskErrorCode;
  readonly message: string;
  readonly details: readonly string[];
}>;
export type TaskResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: TaskError }>;

type TaskFile = Readonly<{
  readonly document: GovernanceDocument;
  readonly task: Task;
  readonly revision: number;
  readonly hash: string;
}>;

function failure<Value>(
  code: TaskErrorCode,
  message: string,
  details: readonly string[] = [],
): TaskResult<Value> {
  return { ok: false, error: { code, message, details } };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function strings(value: unknown, required: boolean): readonly string[] | null {
  if (!Array.isArray(value)) return required ? null : [];
  if (
    !value.every((item) => typeof item === "string" && item.trim().length > 0)
  )
    return null;
  if (required && value.length === 0) return null;
  return value.map((item) => (item as string).trim());
}
function timestamp(value: unknown): UtcIsoTimestamp | null {
  if (typeof value !== "string") return null;
  try {
    return parseUtcIsoTimestamp(value);
  } catch {
    return null;
  }
}
function taskId(value: unknown): TaskId | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = parseFormalId(value);
    return parsed.startsWith("TASK-") ? (parsed as TaskId) : null;
  } catch {
    return null;
  }
}
function goalId(value: unknown): GoalId | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = parseFormalId(value);
    return parsed.startsWith("GOAL-") ? (parsed as GoalId) : null;
  } catch {
    return null;
  }
}
function decisionIds(value: unknown): readonly DecisionId[] | null {
  const values = strings(value, false);
  if (values === null) return null;
  const parsed: DecisionId[] = [];
  for (const item of values) {
    try {
      const id = parseFormalId(item);
      if (!id.startsWith("DEC-")) return null;
      parsed.push(id as DecisionId);
    } catch {
      return null;
    }
  }
  return parsed;
}
function taskIds(value: unknown): readonly TaskId[] | null {
  const values = strings(value, false);
  if (values === null) return null;
  const parsed: TaskId[] = [];
  for (const item of values) {
    const id = taskId(item);
    if (id === null) return null;
    parsed.push(id);
  }
  return parsed;
}
function taskStatus(value: unknown): value is TaskStatus {
  return [
    "draft",
    "ready",
    "in_progress",
    "in_review",
    "completed",
    "blocked",
    "changes_requested",
    "paused",
    "cancelled",
  ].includes(value as string);
}
function roleKey(value: unknown): value is RoleKey {
  return typeof value === "string" && getRole(value as RoleKey) !== undefined;
}
function parseRun(value: unknown): TaskRun | null {
  if (!isRecord(value)) return null;
  const commands = strings(
    value.verificationCommands ?? value.verification_commands,
    true,
  );
  return text(value.mode) &&
    text(value.gitBranch ?? value.git_branch) &&
    text(value.worktree) &&
    commands !== null
    ? {
        mode: value.mode,
        gitBranch: (value.gitBranch ?? value.git_branch) as string,
        worktree: value.worktree,
        verificationCommands: commands,
      }
    : null;
}
function parseCompletion(value: unknown): TaskCompletion | null {
  if (!isRecord(value)) return null;
  const tests = strings(value.tests, true);
  const outstandingIssues = strings(
    value.outstandingIssues ?? value.outstanding_issues,
    false,
  );
  return text(value.output) &&
    tests !== null &&
    outstandingIssues !== null &&
    text(value.handoff)
    ? {
        output: value.output,
        tests,
        ...(text(value.commit) ? { commit: value.commit } : {}),
        outstandingIssues,
        handoff: value.handoff,
      }
    : null;
}
function parseDefinitions(
  value: unknown,
): readonly CustomFieldDefinition[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const result: CustomFieldDefinition[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.key !== "string" ||
      typeof item.label !== "string" ||
      typeof item.type !== "string"
    )
      return null;
    const definitionInput = {
      key: item.key,
      label: item.label,
      type: item.type as never,
      ...(typeof item.required === "boolean"
        ? { required: item.required }
        : {}),
      ...(Array.isArray(item.options)
        ? { options: item.options as string[] }
        : {}),
    };
    const created = createCustomFieldDefinition(definitionInput);
    if (!created.ok) return null;
    result.push(created.value);
  }
  return result;
}
function customValues(value: unknown): CustomFieldValues | null {
  return isRecord(value)
    ? (value as CustomFieldValues)
    : value === undefined
      ? {}
      : null;
}
function parseTask(document: GovernanceDocument): TaskResult<Task> {
  const fm = document.frontMatter;
  const id = taskId(fm.id);
  const goal = goalId(fm.goal_id ?? fm.goalId);
  const dependencies = taskIds(fm.dependencies);
  const associatedDecisions = decisionIds(
    fm.associated_decisions ?? fm.associatedDecisions,
  );
  const scope = strings(fm.scope, true);
  const outputs = strings(fm.outputs, true);
  const acceptance = strings(
    fm.acceptance_criteria ?? fm.acceptanceCriteria,
    true,
  );
  const requiredFiles = strings(fm.required_files ?? fm.requiredFiles, true);
  const onDemandFiles = strings(fm.on_demand_files ?? fm.onDemandFiles, true);
  const allowedPaths = strings(fm.allowed_paths ?? fm.allowedPaths, true);
  const forbiddenPaths = strings(fm.forbidden_paths ?? fm.forbiddenPaths, true);
  const evidence = strings(fm.evidence, true);
  const run = parseRun(fm.run);
  const completion = parseCompletion(fm.completion);
  const definitions = parseDefinitions(
    fm.custom_field_definitions ?? fm.customFieldDefinitions,
  );
  const fields = customValues(fm.custom_fields ?? fm.customFields);
  const createdAt = timestamp(fm.created_at);
  const updatedAt = timestamp(fm.updated_at);
  if (
    fm.document_type !== "task" ||
    id === null ||
    goal === null ||
    !text(fm.title) ||
    !taskStatus(fm.status) ||
    !roleKey(fm.current_role ?? fm.currentRole) ||
    dependencies === null ||
    associatedDecisions === null ||
    scope === null ||
    outputs === null ||
    acceptance === null ||
    requiredFiles === null ||
    onDemandFiles === null ||
    allowedPaths === null ||
    forbiddenPaths === null ||
    evidence === null ||
    run === null ||
    completion === null ||
    definitions === null ||
    fields === null ||
    createdAt === null ||
    updatedAt === null
  )
    return failure("invalid_task", "Task fact document has invalid metadata.");
  const candidate: Task = {
    id,
    title: fm.title,
    status: fm.status,
    goalId: goal,
    currentRole: (fm.current_role ?? fm.currentRole) as RoleKey,
    dependencies,
    purpose: typeof fm.purpose === "string" ? fm.purpose : "",
    scope,
    outputs,
    acceptanceCriteria: acceptance,
    requiredFiles,
    onDemandFiles,
    associatedDecisions,
    allowedPaths,
    forbiddenPaths,
    run,
    evidence,
    customFieldDefinitions: definitions,
    customFields: fields,
    completion,
  };
  const validated = updateTask(candidate, {});
  return validated.ok
    ? validated
    : failure("invalid_task", validated.error.message);
}
function taskDocument(
  task: Task,
  previous: GovernanceDocument | null,
  revision: number,
  createdAt: UtcIsoTimestamp,
  updatedAt: UtcIsoTimestamp,
): GovernanceDocument {
  const old = previous?.frontMatter ?? {};
  return {
    frontMatter: {
      ...old,
      schema_version: 1,
      document_type: "task",
      revision,
      created_at: createdAt,
      updated_at: updatedAt,
      id: task.id,
      title: task.title,
      status: task.status,
      goal_id: task.goalId,
      current_role: task.currentRole,
      dependencies: task.dependencies,
      purpose: task.purpose,
      scope: task.scope,
      outputs: task.outputs,
      acceptance_criteria: task.acceptanceCriteria,
      required_files: task.requiredFiles,
      on_demand_files: task.onDemandFiles,
      associated_decisions: task.associatedDecisions,
      allowed_paths: task.allowedPaths,
      forbidden_paths: task.forbiddenPaths,
      run: {
        mode: task.run.mode,
        git_branch: task.run.gitBranch,
        worktree: task.run.worktree,
        verification_commands: task.run.verificationCommands,
      },
      evidence: task.evidence,
      custom_field_definitions: task.customFieldDefinitions,
      custom_fields: task.customFields,
      completion: {
        output: task.completion.output,
        tests: task.completion.tests,
        ...(task.completion.commit === undefined
          ? {}
          : { commit: task.completion.commit }),
        outstanding_issues: task.completion.outstandingIssues,
        handoff: task.completion.handoff,
      },
    },
    body: `# ${task.id}: ${task.title}\n\n## Purpose\n${task.purpose}\n\n## Scope\n${task.scope.map((item) => `- ${item}`).join("\n")}\n\n## Dependencies\n${task.dependencies.length === 0 ? "- None" : task.dependencies.map((item) => `- ${item}`).join("\n")}\n`,
  };
}
function parseGoal(document: GovernanceDocument): TaskResult<Goal> {
  const fm = document.frontMatter;
  const id = goalId(fm.id);
  const boundary = strings(fm.boundary, true);
  const risks = strings(fm.risks, false);
  const acceptanceCriteria = strings(fm.acceptance_criteria, true);
  const approval = fm.approval;
  if (
    fm.document_type !== "goal" ||
    id === null ||
    !text(fm.title) ||
    boundary === null ||
    risks === null ||
    acceptanceCriteria === null ||
    !taskStatus(fm.status) ||
    (approval !== null && !isRecord(approval))
  )
    return failure("invalid_goal", "Goal fact document has invalid metadata.");
  const parsedApproval =
    isRecord(approval) &&
    approval.approved === true &&
    approval.decidedBy === "user" &&
    text(approval.decidedAt)
      ? {
          decidedBy: "user" as const,
          approved: true as const,
          decidedAt: approval.decidedAt as UtcIsoTimestamp,
        }
      : null;
  return {
    ok: true,
    value: {
      id,
      title: fm.title,
      boundary,
      risks,
      acceptanceCriteria,
      proposedBy: "project-lead-agent",
      status: fm.status as Goal["status"],
      approval: parsedApproval,
    },
  };
}
function dependencyCheck(tasks: readonly Task[], task: Task): TaskResult<true> {
  const all = new Map(tasks.map((item) => [item.id, item]));
  all.set(task.id, task);
  if (new Set(task.dependencies).size !== task.dependencies.length)
    return failure("invalid_dependency", "Task dependencies must be unique.");
  if (task.dependencies.includes(task.id))
    return failure("circular_dependency", "A task cannot depend on itself.");
  const missing = task.dependencies.filter(
    (dependency) => !all.has(dependency),
  );
  if (missing.length > 0)
    return failure(
      "invalid_dependency",
      "Task dependency does not exist.",
      missing,
    );
  const visiting = new Set<TaskId>();
  const visited = new Set<TaskId>();
  const visit = (id: TaskId): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const current = all.get(id);
    if (current?.dependencies.some(visit)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return visit(task.id)
    ? failure(
        "circular_dependency",
        "Task dependencies must not contain a cycle.",
      )
    : { ok: true, value: true };
}
function parsePatch(value: unknown): TaskResult<TaskPatch> {
  if (!isRecord(value))
    return failure("invalid_input", "Task patch must be an object.");
  const patch: Record<string, unknown> = {};
  const textFields = ["title", "purpose"] as const;
  for (const key of textFields)
    if (value[key] !== undefined) {
      if (!text(value[key]))
        return failure("invalid_task", `${key} cannot be empty.`);
      patch[key] = value[key];
    }
  const listFields = [
    "dependencies",
    "scope",
    "outputs",
    "acceptanceCriteria",
    "requiredFiles",
    "onDemandFiles",
    "associatedDecisions",
    "allowedPaths",
    "forbiddenPaths",
    "evidence",
  ] as const;
  for (const key of listFields)
    if (value[key] !== undefined) {
      const parsed = strings(
        value[key],
        key !== "dependencies" && key !== "associatedDecisions",
      );
      if (parsed === null)
        return failure(
          "invalid_task",
          `${key} must be a list of non-empty strings.`,
        );
      patch[key] =
        key === "dependencies"
          ? taskIds(parsed)
          : key === "associatedDecisions"
            ? decisionIds(parsed)
            : parsed;
      if (patch[key] === null)
        return failure("invalid_task", `${key} contains an invalid ID.`);
    }
  if (value.currentRole !== undefined) {
    if (!roleKey(value.currentRole))
      return failure("invalid_task", "Task role is not defined.");
    patch.currentRole = value.currentRole;
  }
  if (value.run !== undefined) {
    const run = parseRun(value.run);
    if (run === null)
      return failure("invalid_task", "Task run configuration is invalid.");
    patch.run = run;
  }
  if (value.completion !== undefined) {
    const completion = parseCompletion(value.completion);
    if (completion === null)
      return failure("invalid_task", "Task completion fields are invalid.");
    patch.completion = completion;
  }
  if (value.customFieldDefinitions !== undefined) {
    const definitions = parseDefinitions(value.customFieldDefinitions);
    if (definitions === null)
      return failure("invalid_task", "Custom field definitions are invalid.");
    patch.customFieldDefinitions = definitions;
  }
  if (value.customFields !== undefined) {
    const fields = customValues(value.customFields);
    if (fields === null)
      return failure("invalid_task", "Custom field values are invalid.");
    patch.customFields = fields;
  }
  return { ok: true, value: patch as TaskPatch };
}

export class TaskService {
  private readonly registryFactory: ProjectRegistryFactory;
  private readonly now: () => UtcIsoTimestamp;
  public constructor(options: TaskServiceOptions = {}) {
    this.registryFactory =
      options.registryFactory ?? (() => new ProjectRegistryRepository());
    this.now =
      options.now ?? (() => parseUtcIsoTimestamp(new Date().toISOString()));
  }
  public async getTasks(projectKey: string): Promise<TaskResult<TaskPage>> {
    const project = await this.findProject(projectKey);
    if (!project.ok) return project;
    const files = await this.readTasks(project.value);
    if (!files.ok) return files;
    return {
      ok: true,
      value: {
        projectKey,
        projectRoot: project.value.rootPath,
        tasks: files.value.map((file) => ({
          task: file.task,
          revision: file.revision,
          hash: file.hash,
        })),
      },
    };
  }
  public async create(input: unknown): Promise<TaskResult<TaskSnapshot>> {
    if (!isRecord(input) || typeof input.projectKey !== "string")
      return failure("invalid_input", "A projectKey is required.");
    const project = await this.findProject(input.projectKey);
    if (!project.ok) return project;
    const files = await this.readTasks(project.value);
    if (!files.ok) return files;
    const goal = await this.readGoal(project.value, input.goalId);
    if (!goal.ok) return goal;
    const source = isRecord(input.task) ? input.task : input;
    const inputTask = this.inputFrom(source, this.nextId(files.value));
    if (!inputTask.ok) return inputTask;
    const created = createTaskDraft(goal.value, inputTask.value);
    if (!created.ok) return failure("invalid_task", created.error.message);
    const dependency = dependencyCheck(
      files.value.map((file) => file.task),
      created.value,
    );
    if (!dependency.ok) return dependency;
    const document = taskDocument(
      created.value,
      null,
      1,
      this.now(),
      this.now(),
    );
    const written = await new GovernanceRepository(
      project.value.rootPath,
    ).write(`.personal-workspace/tasks/${created.value.id}.md`, document, null);
    if (!written.ok)
      return failure(
        "write_failed",
        written.error.message,
        written.error.details,
      );
    const audited = await this.audit(
      project.value.rootPath,
      created.value,
      "task_created",
    );
    if (!audited.ok) return audited;
    return {
      ok: true,
      value: {
        task: created.value,
        revision: written.value.version.revision,
        hash: written.value.version.hash,
      },
    };
  }
  public async update(input: unknown): Promise<TaskResult<TaskSnapshot>> {
    if (
      !isRecord(input) ||
      typeof input.projectKey !== "string" ||
      taskId(input.taskId) === null
    )
      return failure("invalid_input", "A projectKey and taskId are required.");
    const project = await this.findProject(input.projectKey);
    if (!project.ok) return project;
    const files = await this.readTasks(project.value);
    if (!files.ok) return files;
    const current = files.value.find((file) => file.task.id === input.taskId);
    if (current === undefined)
      return failure("task_not_found", "Task was not found.");
    const expectedRevision =
      input.revision === undefined ? null : Number(input.revision);
    const expectedHash = input.hash === undefined ? null : input.hash;
    if (
      (expectedRevision !== null && expectedRevision !== current.revision) ||
      (expectedHash !== null && expectedHash !== current.hash)
    )
      return failure(
        "revision_mismatch",
        "Task changed externally; reload before editing.",
      );
    const parsedPatch = parsePatch(input.patch ?? input);
    if (!parsedPatch.ok) return parsedPatch;
    const next = updateTask(current.task, parsedPatch.value);
    if (!next.ok) return failure("invalid_task", next.error.message);
    const dependency = dependencyCheck(
      files.value.map((file) => file.task),
      next.value,
    );
    if (!dependency.ok) return dependency;
    const updated = { ...next.value, status: current.task.status };
    const document = taskDocument(
      updated,
      current.document,
      current.revision + 1,
      current.document.frontMatter.created_at as UtcIsoTimestamp,
      this.now(),
    );
    const written = await new GovernanceRepository(
      project.value.rootPath,
    ).write(`.personal-workspace/tasks/${updated.id}.md`, document, {
      revision: current.revision,
      hash: current.hash,
    });
    if (!written.ok)
      return failure(
        written.error.code === "revision_mismatch" ||
          written.error.code === "hash_mismatch"
          ? "revision_mismatch"
          : "write_failed",
        written.error.message,
        written.error.details,
      );
    const audited = await this.audit(
      project.value.rootPath,
      updated,
      "task_updated",
    );
    if (!audited.ok) return audited;
    return {
      ok: true,
      value: {
        task: updated,
        revision: written.value.version.revision,
        hash: written.value.version.hash,
      },
    };
  }
  public async ready(input: unknown): Promise<TaskResult<TaskSnapshot>> {
    if (
      !isRecord(input) ||
      typeof input.projectKey !== "string" ||
      taskId(input.taskId) === null
    )
      return failure("invalid_input", "A projectKey and taskId are required.");
    const project = await this.findProject(input.projectKey);
    if (!project.ok) return project;
    const files = await this.readTasks(project.value);
    if (!files.ok) return files;
    const current = files.value.find((file) => file.task.id === input.taskId);
    if (current === undefined)
      return failure("task_not_found", "Task was not found.");
    const goal = await this.readGoal(project.value, current.task.goalId);
    if (!goal.ok) return goal;
    const ready = markTaskReady(goal.value, current.task);
    if (!ready.ok)
      return failure(
        ready.error.code === "goal_not_approved"
          ? "invalid_goal"
          : "invalid_task",
        ready.error.message,
      );
    const document = taskDocument(
      ready.value,
      current.document,
      current.revision + 1,
      current.document.frontMatter.created_at as UtcIsoTimestamp,
      this.now(),
    );
    const written = await new GovernanceRepository(
      project.value.rootPath,
    ).write(`.personal-workspace/tasks/${current.task.id}.md`, document, {
      revision: current.revision,
      hash: current.hash,
    });
    if (!written.ok)
      return failure(
        "revision_mismatch",
        written.error.message,
        written.error.details,
      );
    const audited = await this.audit(
      project.value.rootPath,
      ready.value,
      "task_ready",
    );
    if (!audited.ok) return audited;
    return {
      ok: true,
      value: {
        task: ready.value,
        revision: written.value.version.revision,
        hash: written.value.version.hash,
      },
    };
  }
  public async transition(input: unknown): Promise<TaskResult<TaskSnapshot>> {
    if (
      !isRecord(input) ||
      typeof input.projectKey !== "string" ||
      taskId(input.taskId) === null ||
      !taskStatus(input.toStatus)
    )
      return failure(
        "invalid_input",
        "A projectKey, taskId, and valid toStatus are required.",
      );
    const project = await this.findProject(input.projectKey);
    if (!project.ok) return project;
    const files = await this.readTasks(project.value);
    if (!files.ok) return files;
    const current = files.value.find((file) => file.task.id === input.taskId);
    if (current === undefined)
      return failure("task_not_found", "Task was not found.");
    const expectedRevision =
      input.revision === undefined ? null : Number(input.revision);
    const expectedHash = input.hash === undefined ? null : input.hash;
    if (
      (expectedRevision !== null && expectedRevision !== current.revision) ||
      (expectedHash !== null && expectedHash !== current.hash)
    )
      return failure(
        "revision_mismatch",
        "Task changed externally; reload before transitioning.",
      );
    const transitioned = transitionTask(
      current.task,
      input.toStatus as TaskStatus,
      typeof input.reason === "string" ? input.reason : "",
    );
    if (!transitioned.ok)
      return failure(
        transitioned.error.code === "invalid_task_transition"
          ? "invalid_task_transition"
          : "invalid_task",
        transitioned.error.message,
      );
    const document = taskDocument(
      transitioned.value.task,
      current.document,
      current.revision + 1,
      current.document.frontMatter.created_at as UtcIsoTimestamp,
      this.now(),
    );
    const written = await new GovernanceRepository(
      project.value.rootPath,
    ).write(`.personal-workspace/tasks/${current.task.id}.md`, document, {
      revision: current.revision,
      hash: current.hash,
    });
    if (!written.ok)
      return failure(
        written.error.code === "revision_mismatch" ||
          written.error.code === "hash_mismatch"
          ? "revision_mismatch"
          : "write_failed",
        written.error.message,
        written.error.details,
      );
    const audited = await this.audit(
      project.value.rootPath,
      transitioned.value.task,
      "task_status_changed",
      transitioned.value.audit,
    );
    if (!audited.ok) return audited;
    return {
      ok: true,
      value: {
        task: transitioned.value.task,
        revision: written.value.version.revision,
        hash: written.value.version.hash,
      },
    };
  }
  private inputFrom(
    source: Record<string, unknown>,
    id: TaskId,
  ): TaskResult<TaskInput> {
    const dependencies = taskIds(source.dependencies);
    const associatedDecisions = decisionIds(
      source.associatedDecisions ?? source.associated_decisions,
    );
    const scope = strings(source.scope, true);
    const outputs = strings(source.outputs, true);
    const acceptanceCriteria = strings(
      source.acceptanceCriteria ?? source.acceptance_criteria,
      true,
    );
    const requiredFiles = strings(
      source.requiredFiles ?? source.required_files,
      true,
    );
    const onDemandFiles = strings(
      source.onDemandFiles ?? source.on_demand_files,
      true,
    );
    const allowedPaths = strings(
      source.allowedPaths ?? source.allowed_paths,
      true,
    );
    const forbiddenPaths = strings(
      source.forbiddenPaths ?? source.forbidden_paths,
      true,
    );
    const evidence = strings(source.evidence, true);
    const run = parseRun(source.run);
    const completion = parseCompletion(source.completion);
    const definitions = parseDefinitions(
      source.customFieldDefinitions ?? source.custom_field_definitions,
    );
    const fields = customValues(source.customFields ?? source.custom_fields);
    if (
      !text(source.title) ||
      !roleKey(source.currentRole ?? source.current_role) ||
      dependencies === null ||
      associatedDecisions === null ||
      scope === null ||
      outputs === null ||
      acceptanceCriteria === null ||
      requiredFiles === null ||
      onDemandFiles === null ||
      allowedPaths === null ||
      forbiddenPaths === null ||
      evidence === null ||
      run === null ||
      completion === null ||
      definitions === null ||
      fields === null ||
      !text(source.purpose)
    )
      return failure("invalid_input", "Task required fields are incomplete.");
    return {
      ok: true,
      value: {
        id,
        title: source.title,
        currentRole: (source.currentRole ?? source.current_role) as RoleKey,
        dependencies,
        purpose: source.purpose,
        scope,
        outputs,
        acceptanceCriteria,
        requiredFiles,
        onDemandFiles,
        associatedDecisions,
        allowedPaths,
        forbiddenPaths,
        run,
        evidence,
        customFieldDefinitions: definitions,
        customFields: fields,
        completion,
      },
    };
  }
  private nextId(files: readonly TaskFile[]): TaskId {
    const next =
      files.reduce(
        (max, file) => Math.max(max, Number(file.task.id.slice(5))),
        0,
      ) + 1;
    return `TASK-${String(next).padStart(3, "0")}` as TaskId;
  }
  private async findProject(
    projectKey: string,
  ): Promise<TaskResult<ProjectIndexRecord>> {
    let registry: ProjectRegistryRepository;
    try {
      registry = this.registryFactory();
    } catch (error) {
      return failure(
        "registry_failed",
        "Project registry could not be opened.",
        [String(error)],
      );
    }
    try {
      const listed = registry.list();
      if (!listed.ok)
        return failure(
          "registry_failed",
          listed.error.message,
          listed.error.details,
        );
      const project = listed.value.find(
        (item) => item.projectKey === projectKey && !item.archived,
      );
      return project === undefined
        ? failure("project_not_found", "Project is not registered or archived.")
        : { ok: true, value: project };
    } finally {
      registry.close();
    }
  }
  private async readGoal(
    project: ProjectIndexRecord,
    value: unknown,
  ): Promise<TaskResult<Goal>> {
    const id = goalId(value);
    if (id === null)
      return failure("invalid_input", "A valid goalId is required.");
    const read = await new GovernanceRepository(project.rootPath).read(
      `.personal-workspace/goals/${id}.md`,
    );
    if (!read.ok)
      return failure(
        read.error.code === "not_found" ? "goal_not_found" : "invalid_goal",
        read.error.message,
        read.error.details,
      );
    return parseGoal(read.value.document);
  }
  private async readTasks(
    project: ProjectIndexRecord,
  ): Promise<TaskResult<readonly TaskFile[]>> {
    let names: string[];
    try {
      names = (
        await readdir(`${project.rootPath}/.personal-workspace/tasks`)
      ).filter((name) => /^TASK-\d{3}\.md$/.test(name));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return { ok: true, value: [] };
      return failure("invalid_task", "Task facts could not be listed.", [
        String(error),
      ]);
    }
    const files: TaskFile[] = [];
    for (const name of names.sort()) {
      const read = await new GovernanceRepository(project.rootPath).read(
        `.personal-workspace/tasks/${name}`,
      );
      if (!read.ok)
        return failure("invalid_task", read.error.message, read.error.details);
      const parsed = parseTask(read.value.document);
      if (!parsed.ok) return parsed;
      files.push({
        document: read.value.document,
        task: parsed.value,
        revision: read.value.version.revision,
        hash: read.value.version.hash,
      });
    }
    return { ok: true, value: files };
  }
  private async audit(
    root: string,
    task: Task,
    action: string,
    transition?: Readonly<{
      readonly fromStatus: TaskStatus;
      readonly toStatus: TaskStatus;
      readonly reason: string;
    }>,
  ): Promise<TaskResult<true>> {
    const repository = new AuditLogRepository(root);
    const events = await repository.readAll();
    if (!events.ok)
      return failure(
        "audit_failed",
        events.error.message,
        events.error.details,
      );
    const next =
      events.value.reduce(
        (max, event) => Math.max(max, Number(event.id.slice(5))),
        0,
      ) + 1;
    const executionId = parseFormalId(
      `EXEC-${String(next).padStart(3, "0")}`,
    ) as ExecutionId;
    const created = createAuditEvent({
      id: executionId,
      occurredAt: this.now(),
      type: "status_changed",
      actor: "user",
      action,
      relatedObjectIds: [task.id, task.goalId, ...task.dependencies],
      executionId,
      statusChange: {
        from: transition?.fromStatus ?? task.status,
        to: transition?.toStatus ?? task.status,
        reason:
          transition?.reason ||
          "Task fact was created or edited through the governed task service.",
      },
      details: {
        dependency_count: task.dependencies.length,
        role: task.currentRole,
      },
    });
    if (!created.ok) return failure("audit_failed", created.error.message);
    const appended = await repository.append(created.value);
    return appended.ok
      ? { ok: true, value: true }
      : failure("audit_failed", appended.error.message, appended.error.details);
  }
}
