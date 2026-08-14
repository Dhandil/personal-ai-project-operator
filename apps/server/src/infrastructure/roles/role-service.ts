import { lstat } from "node:fs/promises";

import {
  createDefaultRoles,
  roleKeys,
  type Role,
  type RoleKey,
} from "@personal-ai-operator/domain";
import { GovernanceRepository } from "../files/governance-repository.js";
import type { GovernanceDocument } from "../files/governance-codec.js";
import {
  ProjectRegistryRepository,
  type ProjectIndexRecord,
} from "../registry/project-registry-repository.js";
import type { ProjectRegistryFactory } from "../projects/project-startup.js";

export type RoleContextItem = Readonly<{
  readonly name: string;
  readonly required: boolean;
  readonly paths: readonly string[];
  readonly state: "available" | "missing";
}>;
export type RoleView = Readonly<{
  readonly role: Role;
  readonly source: "default" | "project";
  readonly relativePath: string;
  readonly fileState: "available" | "missing";
  readonly context: Readonly<{
    readonly mustRead: readonly RoleContextItem[];
    readonly onDemandRead: readonly RoleContextItem[];
  }>;
  readonly canModifyProjectFiles: boolean;
  readonly revision: number | null;
  readonly hash: string | null;
}>;
export type RolePage = Readonly<{
  readonly projectKey: string;
  readonly projectRoot: string;
  readonly roles: readonly RoleView[];
}>;
export type RoleResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: RoleError }>;
export type RoleErrorCode =
  | "invalid_input"
  | "registry_failed"
  | "project_not_found"
  | "invalid_role"
  | "revision_mismatch"
  | "write_failed";
export type RoleError = Readonly<{
  readonly code: RoleErrorCode;
  readonly message: string;
  readonly details: readonly string[];
}>;
export type RoleServiceOptions = Readonly<{
  readonly registryFactory?: ProjectRegistryFactory;
}>;

const contextPaths: Readonly<Record<string, readonly string[]>> = {
  "approved goal": [".personal-workspace/goals"],
  "project state": [".personal-workspace/status.md"],
  "discovery notes": [".personal-workspace/stages/02-discovery"],
  "decision records": [".personal-workspace/decisions"],
  "user context": [".personal-workspace/project.md"],
  "research evidence": [".personal-workspace/stages/02-discovery"],
  "existing decisions": [".personal-workspace/decisions"],
  requirements: [".personal-workspace/stages/03-spec/03-spec.md"],
  "repository guidance": ["AGENTS.md", "README.md"],
  "prior decisions": [".personal-workspace/decisions"],
  "task card": [".personal-workspace/tasks"],
  "required files": [".personal-workspace/tasks"],
  architecture: [".personal-workspace/stages/03-spec/03-spec.md"],
  "verification evidence": [
    ".personal-workspace/tasks",
    ".personal-workspace/reports",
  ],
  "implementation details": [".personal-workspace/stages/03-spec/03-spec.md"],
};

function failure<Value>(
  code: RoleErrorCode,
  message: string,
  details: readonly string[] = [],
): RoleResult<Value> {
  return { ok: false, error: { code, message, details } };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isRoleKey(value: unknown): value is RoleKey {
  return typeof value === "string" && roleKeys.includes(value as RoleKey);
}
function strings(value: unknown): readonly string[] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((item) => typeof item === "string" && item.trim().length > 0)
  )
    return null;
  return value.map((item) => (item as string).trim());
}

function roleFrom(value: unknown): RoleResult<Role> {
  if (
    !isRecord(value) ||
    !isRoleKey(value.key) ||
    typeof value.title !== "string" ||
    value.title.trim().length === 0
  )
    return failure("invalid_role", "Role key and title are required.");
  if ("agent" in value || "sessionId" in value || "session_id" in value)
    return failure(
      "invalid_role",
      "Roles cannot contain Agent or session bindings.",
    );
  const fields = [
    "responsibilities",
    "mustRead",
    "onDemandRead",
    "allowedActions",
    "forbiddenActions",
    "handoff",
  ] as const;
  const parsed = Object.fromEntries(
    fields.map((field) => [field, strings(value[field])]),
  ) as Record<(typeof fields)[number], readonly string[] | null>;
  if (fields.some((field) => parsed[field] === null))
    return failure(
      "invalid_role",
      "Role responsibilities, context, actions, and handoff are required.",
    );
  const role: Role = {
    key: value.key,
    title: value.title.trim(),
    responsibilities: parsed.responsibilities as readonly string[],
    mustRead: parsed.mustRead as readonly string[],
    onDemandRead: parsed.onDemandRead as readonly string[],
    allowedActions: parsed.allowedActions as readonly string[],
    forbiddenActions: parsed.forbiddenActions as readonly string[],
    handoff: parsed.handoff as readonly string[],
  };
  if (
    role.key === "reviewer" &&
    (!role.allowedActions.includes("read repository") ||
      !role.forbiddenActions.includes("modify implementation"))
  )
    return failure(
      "invalid_role",
      "The reviewer role must remain read-only for formal implementation files.",
    );
  return { ok: true, value: role };
}

async function exists(root: string, relativePath: string): Promise<boolean> {
  try {
    await lstat(`${root}/${relativePath}`);
    return true;
  } catch {
    return false;
  }
}
async function contextItem(
  root: string,
  name: string,
  required: boolean,
): Promise<RoleContextItem> {
  const paths = contextPaths[name] ?? [];
  const available =
    paths.length > 0 &&
    (await Promise.all(paths.map((path) => exists(root, path)))).some(Boolean);
  return { name, required, paths, state: available ? "available" : "missing" };
}
function roleDocument(
  role: Role,
  revision: number,
  createdAt: unknown,
  updatedAt: unknown,
): GovernanceDocument {
  return {
    frontMatter: {
      schema_version: 1,
      document_type: "role",
      revision,
      created_at: createdAt,
      updated_at: updatedAt,
      key: role.key,
      title: role.title,
      responsibilities: role.responsibilities,
      must_read: role.mustRead,
      on_demand_read: role.onDemandRead,
      allowed_actions: role.allowedActions,
      forbidden_actions: role.forbiddenActions,
      handoff: role.handoff,
    },
    body: `# ${role.title}\n\nRole key: ${role.key}\n\nThis role template is project-editable and is not bound to an Agent or session.\n`,
  };
}

export class RoleService {
  private readonly registryFactory: ProjectRegistryFactory;
  public constructor(options: RoleServiceOptions = {}) {
    this.registryFactory =
      options.registryFactory ?? (() => new ProjectRegistryRepository());
  }

  public async getRoles(projectKey: string): Promise<RoleResult<RolePage>> {
    const project = await this.findProject(projectKey);
    if (!project.ok) return project;
    const roles = await Promise.all(
      createDefaultRoles().map((role) => this.viewRole(project.value, role)),
    );
    return {
      ok: true,
      value: { projectKey, projectRoot: project.value.rootPath, roles },
    };
  }

  public async updateRole(input: unknown): Promise<RoleResult<RoleView>> {
    if (!isRecord(input) || typeof input.projectKey !== "string")
      return failure("invalid_input", "A projectKey and role are required.");
    const roleResult = roleFrom(input.role);
    if (!roleResult.ok) return roleResult;
    const project = await this.findProject(input.projectKey);
    if (!project.ok) return project;
    const relativePath = `.personal-workspace/roles/${roleResult.value.key}.md`;
    const current = await new GovernanceRepository(project.value.rootPath).read(
      relativePath,
    );
    if (!current.ok && current.error.code !== "not_found")
      return failure(
        "invalid_role",
        current.error.message,
        current.error.details,
      );
    const expected = current.ok ? current.value.version : null;
    const now = new Date().toISOString();
    const createdAt = current.ok
      ? current.value.document.frontMatter.created_at
      : now;
    const written = await new GovernanceRepository(
      project.value.rootPath,
    ).write(
      relativePath,
      roleDocument(
        roleResult.value,
        (current.ok ? current.value.version.revision : 0) + 1,
        createdAt,
        now,
      ),
      expected,
    );
    if (!written.ok)
      return failure(
        written.error.code === "revision_mismatch" ||
          written.error.code === "hash_mismatch"
          ? "revision_mismatch"
          : "write_failed",
        written.error.message,
        written.error.details,
      );
    return {
      ok: true,
      value: await this.viewRole(project.value, roleResult.value),
    };
  }

  private async findProject(
    projectKey: string,
  ): Promise<RoleResult<ProjectIndexRecord>> {
    let registry: ProjectRegistryRepository;
    try {
      registry = this.registryFactory();
    } catch (error) {
      return failure(
        "registry_failed",
        "The project registry could not be opened.",
        [error instanceof Error ? error.message : String(error)],
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
        (record) => record.projectKey === projectKey && !record.archived,
      );
      return project === undefined
        ? failure(
            "project_not_found",
            "Project is not registered or is archived.",
          )
        : { ok: true, value: project };
    } finally {
      registry.close();
    }
  }

  private async viewRole(
    project: ProjectIndexRecord,
    fallback: Role,
  ): Promise<RoleView> {
    const relativePath = `.personal-workspace/roles/${fallback.key}.md`;
    const read = await new GovernanceRepository(project.rootPath).read(
      relativePath,
    );
    let role = fallback;
    let source: "default" | "project" = "default";
    let revision: number | null = null;
    let hash: string | null = null;
    if (read.ok) {
      const frontMatter = read.value.document.frontMatter;
      const parsed = roleFrom({
        key: frontMatter.key,
        title: frontMatter.title,
        responsibilities: frontMatter.responsibilities,
        mustRead: frontMatter.must_read,
        onDemandRead: frontMatter.on_demand_read,
        allowedActions: frontMatter.allowed_actions,
        forbiddenActions: frontMatter.forbidden_actions,
        handoff: frontMatter.handoff,
      });
      if (!parsed.ok) throw new Error(parsed.error.message);
      role = parsed.value;
      source = "project";
      revision = read.value.version.revision;
      hash = read.value.version.hash;
    }
    const mustRead = await Promise.all(
      role.mustRead.map((name) => contextItem(project.rootPath, name, true)),
    );
    const onDemandRead = await Promise.all(
      role.onDemandRead.map((name) =>
        contextItem(project.rootPath, name, false),
      ),
    );
    return {
      role,
      source,
      relativePath,
      fileState: read.ok ? "available" : "missing",
      context: { mustRead, onDemandRead },
      canModifyProjectFiles: role.key !== "reviewer",
      revision,
      hash,
    };
  }
}
