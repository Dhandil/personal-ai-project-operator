import { lstat } from "node:fs/promises";
import { resolve } from "node:path";

import {
  outputSchemaIdForRole,
  type TaskPackageOutputSchemaId,
  type TaskPackageRole,
} from "@personal-ai-operator/contracts";

import { GoalService } from "../goals/goal-service.js";
import { RoleService, type RoleContextItem } from "../roles/role-service.js";
import { TaskService } from "../tasks/task-service.js";

export type TaskPackageContextReference = Readonly<{
  readonly name: string;
  readonly required: boolean;
  readonly relativePaths: readonly string[];
  readonly absolutePaths: readonly string[];
  readonly state: "available" | "missing";
}>;

export type TaskPackageOutputSchema = Readonly<{
  readonly id: TaskPackageOutputSchemaId;
  readonly version: 1;
  readonly requiredFields: readonly string[];
}>;

export type TaskPackage = Readonly<{
  readonly schemaVersion: 1;
  readonly kind: "task_package";
  readonly projectKey: string;
  readonly projectRoot: string;
  readonly taskId: string;
  readonly goalId: string;
  readonly role: TaskPackageRole;
  readonly roleDefinition: Readonly<{
    readonly key: string;
    readonly title: string;
    readonly responsibilities: readonly string[];
    readonly allowedActions: readonly string[];
    readonly forbiddenActions: readonly string[];
    readonly handoff: readonly string[];
  }>;
  readonly task: Readonly<{
    readonly title: string;
    readonly purpose: string;
    readonly scope: readonly string[];
    readonly outputs: readonly string[];
    readonly acceptanceCriteria: readonly string[];
    readonly dependencies: readonly string[];
    readonly currentRole: string;
    readonly requiredFiles: readonly string[];
    readonly onDemandFiles: readonly string[];
    readonly verificationCommands: readonly string[];
    readonly handoff: string;
  }>;
  readonly context: Readonly<{
    readonly mustRead: readonly TaskPackageContextReference[];
    readonly onDemandRead: readonly TaskPackageContextReference[];
  }>;
  readonly paths: Readonly<{
    readonly workingDirectory: string;
    readonly allowed: readonly string[];
    readonly forbidden: readonly string[];
  }>;
  readonly permissions: Readonly<{
    readonly mode: "workspace_write" | "read_only";
    readonly canModifyProjectFiles: boolean;
    readonly allowedActions: readonly string[];
    readonly forbiddenActions: readonly string[];
  }>;
  readonly outputSchema: TaskPackageOutputSchema;
}>;

export type TaskPackageResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: TaskPackageError }>;

export type TaskPackageErrorCode =
  | "invalid_input"
  | "registry_failed"
  | "project_not_found"
  | "task_not_found"
  | "goal_not_found"
  | "role_not_found"
  | "unsupported_role";

export type TaskPackageError = Readonly<{
  readonly code: TaskPackageErrorCode;
  readonly message: string;
  readonly details: readonly string[];
}>;

export type TaskPackageServiceOptions = Readonly<{
  readonly taskService?: TaskService;
  readonly goalService?: GoalService;
  readonly roleService?: RoleService;
}>;

function failure<Value>(
  code: TaskPackageErrorCode,
  message: string,
  details: readonly string[] = [],
): TaskPackageResult<Value> {
  return { ok: false, error: { code, message, details } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPackageRole(value: unknown): value is TaskPackageRole {
  return value === "executor" || value === "reviewer";
}

function outputFields(role: TaskPackageRole): readonly string[] {
  return role === "executor"
    ? [
        "schemaVersion",
        "kind",
        "taskId",
        "status",
        "summary",
        "changedPaths",
        "verification",
        "evidence",
        "commit",
        "outstandingIssues",
        "handoff",
      ]
    : [
        "schemaVersion",
        "kind",
        "taskId",
        "decision",
        "findings",
        "verificationEvidence",
        "requiredChanges",
        "handoff",
      ];
}

async function pathState(
  projectRoot: string,
  relativePaths: readonly string[],
): Promise<"available" | "missing"> {
  if (relativePaths.length === 0) return "missing";
  const states = await Promise.all(
    relativePaths.map(async (path) => {
      try {
        await lstat(resolve(projectRoot, path));
        return true;
      } catch {
        return false;
      }
    }),
  );
  return states.some(Boolean) ? "available" : "missing";
}

async function contextReference(
  projectRoot: string,
  item: RoleContextItem,
): Promise<TaskPackageContextReference> {
  return {
    name: item.name,
    required: item.required,
    relativePaths: item.paths,
    absolutePaths: item.paths.map((path) => resolve(projectRoot, path)),
    state: await pathState(projectRoot, item.paths),
  };
}

async function taskFileReference(
  projectRoot: string,
  path: string,
  required: boolean,
): Promise<TaskPackageContextReference> {
  return {
    name: required ? "task required file" : "task on-demand file",
    required,
    relativePaths: [path],
    absolutePaths: [resolve(projectRoot, path)],
    state: await pathState(projectRoot, [path]),
  };
}

export class TaskPackageService {
  private readonly taskService: TaskService;
  private readonly goalService: GoalService;
  private readonly roleService: RoleService;

  public constructor(options: TaskPackageServiceOptions = {}) {
    this.taskService = options.taskService ?? new TaskService();
    this.goalService = options.goalService ?? new GoalService();
    this.roleService = options.roleService ?? new RoleService();
  }

  public async build(input: unknown): Promise<TaskPackageResult<TaskPackage>> {
    if (
      !isRecord(input) ||
      typeof input.projectKey !== "string" ||
      typeof input.taskId !== "string"
    )
      return failure(
        "invalid_input",
        "A projectKey and taskId are required to build a task package.",
      );
    const tasks = await this.taskService.getTasks(input.projectKey);
    if (!tasks.ok)
      return failure(
        tasks.error.code === "registry_failed"
          ? "registry_failed"
          : tasks.error.code === "project_not_found"
            ? "project_not_found"
            : "task_not_found",
        tasks.error.message,
        tasks.error.details,
      );
    const task = tasks.value.tasks.find(
      (item) => item.task.id === input.taskId,
    );
    if (task === undefined)
      return failure("task_not_found", "Task was not found.");
    const goals = await this.goalService.getGoals(input.projectKey);
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
    const goal = goals.value.goals.find(
      (item) => item.goal.id === task.task.goalId,
    );
    if (goal === undefined)
      return failure("goal_not_found", "Task goal was not found.");
    const roles = await this.roleService.getRoles(input.projectKey);
    if (!roles.ok)
      return failure(
        roles.error.code === "registry_failed"
          ? "registry_failed"
          : roles.error.code === "project_not_found"
            ? "project_not_found"
            : "role_not_found",
        roles.error.message,
        roles.error.details,
      );
    const requestedRole = input.role ?? task.task.currentRole;
    if (!isPackageRole(requestedRole))
      return failure(
        "unsupported_role",
        "Only executor and reviewer task packages have structured output schemas.",
      );
    const role = roles.value.roles.find(
      (item) => item.role.key === requestedRole,
    );
    if (role === undefined)
      return failure("role_not_found", "Role was not found.");

    const roleMustRead = await Promise.all(
      role.context.mustRead.map((item) =>
        contextReference(tasks.value.projectRoot, item),
      ),
    );
    const taskRequired = await Promise.all(
      task.task.requiredFiles.map((path) =>
        taskFileReference(tasks.value.projectRoot, path, true),
      ),
    );
    const roleOnDemandRead = await Promise.all(
      role.context.onDemandRead.map((item) =>
        contextReference(tasks.value.projectRoot, item),
      ),
    );
    const taskOnDemand = await Promise.all(
      task.task.onDemandFiles.map((path) =>
        taskFileReference(tasks.value.projectRoot, path, false),
      ),
    );
    const outputSchemaId = outputSchemaIdForRole(requestedRole);
    return {
      ok: true,
      value: {
        schemaVersion: 1,
        kind: "task_package",
        projectKey: input.projectKey,
        projectRoot: tasks.value.projectRoot,
        taskId: task.task.id,
        goalId: task.task.goalId,
        role: requestedRole,
        roleDefinition: {
          key: role.role.key,
          title: role.role.title,
          responsibilities: role.role.responsibilities,
          allowedActions: role.role.allowedActions,
          forbiddenActions: role.role.forbiddenActions,
          handoff: role.role.handoff,
        },
        task: {
          title: task.task.title,
          purpose: task.task.purpose,
          scope: task.task.scope,
          outputs: task.task.outputs,
          acceptanceCriteria: task.task.acceptanceCriteria,
          dependencies: task.task.dependencies,
          currentRole: task.task.currentRole,
          requiredFiles: task.task.requiredFiles,
          onDemandFiles: task.task.onDemandFiles,
          verificationCommands: task.task.run.verificationCommands,
          handoff: task.task.completion.handoff,
        },
        context: {
          mustRead: [...roleMustRead, ...taskRequired],
          onDemandRead: [...roleOnDemandRead, ...taskOnDemand],
        },
        paths: {
          workingDirectory: resolve(
            tasks.value.projectRoot,
            task.task.run.worktree,
          ),
          allowed: task.task.allowedPaths.map((path) =>
            resolve(tasks.value.projectRoot, path),
          ),
          forbidden: task.task.forbiddenPaths.map((path) =>
            resolve(tasks.value.projectRoot, path),
          ),
        },
        permissions: {
          mode: requestedRole === "reviewer" ? "read_only" : "workspace_write",
          canModifyProjectFiles: requestedRole !== "reviewer",
          allowedActions: role.role.allowedActions,
          forbiddenActions: role.role.forbiddenActions,
        },
        outputSchema: {
          id: outputSchemaId,
          version: 1,
          requiredFields: outputFields(requestedRole),
        },
      },
    };
  }
}
