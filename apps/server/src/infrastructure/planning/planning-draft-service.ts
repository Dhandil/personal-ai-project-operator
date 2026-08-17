import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

import {
  cloneRole,
  createGoalProposal,
  createTaskDraft,
  decideGoal,
  firstDependencyFreeTask,
  getRole,
  markTaskReady,
  validatePlanningDraft,
  validateStageArtifactPayload,
  type Goal,
  type PlanningDraft,
  type PlanningGoalDraft,
  type PlanningRoleDraft,
  type PlanningTaskDraft,
  type Role,
  type RoleKey,
  type Task,
} from "@personal-ai-operator/domain";
import {
  parseFormalId,
  type ExecutionId,
  type GoalId,
  type TaskId,
  type UtcIsoTimestamp,
} from "@personal-ai-operator/contracts";

import { createAuditEvent } from "../audit/audit-event.js";
import { AuditLogRepository } from "../audit/audit-log-repository.js";
import {
  GovernanceRepository,
  type FileVersion,
} from "../files/governance-repository.js";
import type { GovernanceDocument } from "../files/governance-codec.js";
import {
  ProjectRegistryRepository,
  type ProjectIndexRecord,
} from "../registry/project-registry-repository.js";
import type { ProjectRegistryFactory } from "../projects/project-startup.js";

export const planningDraftRelativePath =
  ".personal-workspace/stages/03-spec/planning-draft.md";

type PlanningDraftStatus = "candidate" | "rejected" | "approved";

export type PlanningDraftSnapshot = Readonly<{
  readonly projectKey: string;
  readonly projectRoot: string;
  readonly draft: PlanningDraft;
  readonly status: PlanningDraftStatus;
  readonly revision: number;
  readonly hash: string;
}>;

export type PlanningDraftResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: PlanningDraftError }>;

export type PlanningDraftErrorCode =
  | "invalid_input"
  | "registry_failed"
  | "project_not_found"
  | "spec_not_approved"
  | "draft_not_found"
  | "invalid_draft"
  | "revision_mismatch"
  | "conflict"
  | "approval_required"
  | "write_failed"
  | "partial_write"
  | "audit_failed";

export type PlanningDraftError = Readonly<{
  readonly code: PlanningDraftErrorCode;
  readonly message: string;
  readonly details: readonly string[];
  readonly recoveryPlan?: readonly string[];
}>;

export type PlanningDraftServiceOptions = Readonly<{
  readonly registryFactory?: ProjectRegistryFactory;
  readonly now?: () => UtcIsoTimestamp;
}>;

type DraftFile = Readonly<{
  readonly document: GovernanceDocument;
  readonly draft: PlanningDraft;
  readonly status: PlanningDraftStatus;
  readonly version: FileVersion;
}>;

type SpecSource = Readonly<{
  readonly requirements: readonly string[];
  readonly constraints: readonly string[];
  readonly validationPlan: readonly string[];
  readonly version: FileVersion;
}>;

function failure<Value>(
  code: PlanningDraftErrorCode,
  message: string,
  details: readonly string[] = [],
  recoveryPlan?: readonly string[],
): PlanningDraftResult<Value> {
  return {
    ok: false,
    error: {
      code,
      message,
      details,
      ...(recoveryPlan === undefined ? {} : { recoveryPlan }),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function strings(value: unknown): readonly string[] | null {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string" && item.trim().length > 0)
  ) {
    return null;
  }
  return value.map((item) => (item as string).trim());
}

function draftStatus(value: unknown): value is PlanningDraftStatus {
  return value === "candidate" || value === "rejected" || value === "approved";
}

function parseRole(value: unknown): PlanningRoleDraft | null {
  if (!isRecord(value) || typeof value.key !== "string") return null;
  const role = getRole(value.key as RoleKey);
  if (role === undefined) return null;
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
  if (fields.some((field) => parsed[field] === null) || !text(value.title)) {
    return null;
  }
  return {
    key: value.key as RoleKey,
    title: value.title,
    responsibilities: parsed.responsibilities as readonly string[],
    mustRead: parsed.mustRead as readonly string[],
    onDemandRead: parsed.onDemandRead as readonly string[],
    allowedActions: parsed.allowedActions as readonly string[],
    forbiddenActions: parsed.forbiddenActions as readonly string[],
    handoff: parsed.handoff as readonly string[],
  };
}

function parseGoal(value: unknown): PlanningGoalDraft | null {
  if (!isRecord(value)) return null;
  const boundary = strings(value.boundary);
  const risks = value.risks === undefined ? [] : strings(value.risks);
  const acceptance = strings(
    value.acceptanceCriteria ?? value.acceptance_criteria,
  );
  if (
    typeof value.id !== "string" ||
    !text(value.title) ||
    boundary === null ||
    risks === null ||
    acceptance === null
  ) {
    return null;
  }
  return {
    id: value.id as GoalId,
    title: value.title,
    boundary,
    risks,
    acceptanceCriteria: acceptance,
  };
}

function snakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function parseTask(value: unknown): PlanningTaskDraft | null {
  if (!isRecord(value)) return null;
  const arrays = [
    "dependencies",
    "scope",
    "outputs",
    "acceptanceCriteria",
    "requiredFiles",
    "onDemandFiles",
    "allowedPaths",
    "forbiddenPaths",
    "verificationCommands",
  ] as const;
  const parsed = Object.fromEntries(
    arrays.map((field) => [
      field,
      strings(value[field] ?? value[snakeCase(field)]),
    ]),
  ) as Record<(typeof arrays)[number], readonly string[] | null>;
  if (
    typeof value.id !== "string" ||
    (typeof value.goalId !== "string" && typeof value.goal_id !== "string") ||
    !text(value.title) ||
    !text(value.currentRole ?? value.current_role) ||
    !text(value.purpose) ||
    arrays.some((field) => parsed[field] === null)
  ) {
    return null;
  }
  return {
    id: value.id as TaskId,
    title: value.title,
    goalId: (value.goalId ?? value.goal_id) as GoalId,
    currentRole: (value.currentRole ?? value.current_role) as RoleKey,
    dependencies: parsed.dependencies as readonly TaskId[],
    purpose: value.purpose,
    scope: parsed.scope as readonly string[],
    outputs: parsed.outputs as readonly string[],
    acceptanceCriteria: parsed.acceptanceCriteria as readonly string[],
    requiredFiles: parsed.requiredFiles as readonly string[],
    onDemandFiles: parsed.onDemandFiles as readonly string[],
    allowedPaths: parsed.allowedPaths as readonly string[],
    forbiddenPaths: parsed.forbiddenPaths as readonly string[],
    verificationCommands: parsed.verificationCommands as readonly string[],
  };
}

function parseDraft(
  document: GovernanceDocument,
): PlanningDraftResult<DraftFile> {
  const fm = document.frontMatter;
  const goals = Array.isArray(fm.goal_drafts)
    ? fm.goal_drafts.map(parseGoal)
    : [];
  const roles = Array.isArray(fm.role_drafts)
    ? fm.role_drafts.map(parseRole)
    : [];
  const tasks = Array.isArray(fm.task_drafts)
    ? fm.task_drafts.map(parseTask)
    : [];
  const graph = isRecord(fm.dependency_graph)
    ? Object.fromEntries(
        Object.entries(fm.dependency_graph).map(([key, value]) => [
          key,
          strings(value),
        ]),
      )
    : null;
  if (
    fm.document_type !== "planning_draft" ||
    !draftStatus(fm.draft_status) ||
    typeof fm.spec_revision !== "number" ||
    !text(fm.spec_hash) ||
    !text(fm.handoff) ||
    goals.some((item) => item === null) ||
    roles.some((item) => item === null) ||
    tasks.some((item) => item === null) ||
    graph === null ||
    Object.values(graph).some((item) => item === null)
  ) {
    return failure("invalid_draft", "Planning draft metadata is invalid.");
  }
  const draft: PlanningDraft = {
    schemaVersion: 1,
    kind: "planning_draft",
    specRevision: fm.spec_revision,
    specHash: fm.spec_hash,
    goalDrafts: goals as PlanningGoalDraft[],
    roleDrafts: roles as PlanningRoleDraft[],
    taskDrafts: tasks as PlanningTaskDraft[],
    dependencyGraph: graph as Readonly<Record<string, readonly string[]>>,
    handoff: fm.handoff,
  };
  const validated = validatePlanningDraft(draft);
  if (!validated.ok) return failure("invalid_draft", validated.error.message);
  const revision = fm.revision;
  if (typeof revision !== "number" || revision < 1) {
    return failure("invalid_draft", "Planning draft revision is invalid.");
  }
  return {
    ok: true,
    value: {
      document,
      draft: validated.value,
      status: fm.draft_status,
      version: { revision, hash: "" },
    },
  };
}

function renderDraft(
  draft: PlanningDraft,
  status: PlanningDraftStatus,
): string {
  return [
    "# Planning draft",
    "",
    `Status: ${status}`,
    `Spec revision: ${draft.specRevision}`,
    `Spec hash: ${draft.specHash}`,
    "",
    "## Goals",
    ...draft.goalDrafts.map((goal) => `- ${goal.id}: ${goal.title}`),
    "",
    "## Roles",
    ...draft.roleDrafts.map((role) => `- ${role.key}: ${role.title}`),
    "",
    "## Tasks",
    ...draft.taskDrafts.map(
      (task) =>
        `- ${task.id}: ${task.title} (${task.dependencies.join(", ") || "no dependencies"})`,
    ),
    "",
    `Handoff: ${draft.handoff}`,
    "",
  ].join("\n");
}

function draftDocument(
  draft: PlanningDraft,
  status: PlanningDraftStatus,
  revision: number,
  createdAt: UtcIsoTimestamp,
  updatedAt: UtcIsoTimestamp,
  previous: GovernanceDocument | null,
  approval?: Readonly<{ readonly note: string; readonly at: UtcIsoTimestamp }>,
): GovernanceDocument {
  return {
    frontMatter: {
      ...(previous?.frontMatter ?? {}),
      schema_version: 1,
      document_type: "planning_draft",
      revision,
      created_at: createdAt,
      updated_at: updatedAt,
      draft_status: status,
      spec_revision: draft.specRevision,
      spec_hash: draft.specHash,
      goal_drafts: draft.goalDrafts,
      role_drafts: draft.roleDrafts,
      task_drafts: draft.taskDrafts,
      dependency_graph: draft.dependencyGraph,
      handoff: draft.handoff,
      ...(approval === undefined
        ? {}
        : {
            approved_by: "user",
            approved_at: approval.at,
            approval_note: approval.note,
          }),
    },
    body: renderDraft(draft, status),
  };
}

function goalDocument(
  goal: Goal,
  revision: number,
  now: UtcIsoTimestamp,
): GovernanceDocument {
  return {
    frontMatter: {
      schema_version: 1,
      document_type: "goal",
      revision,
      created_at: now,
      updated_at: now,
      id: goal.id,
      title: goal.title,
      boundary: goal.boundary,
      risks: goal.risks,
      acceptance_criteria: goal.acceptanceCriteria,
      proposed_by: goal.proposedBy,
      status: goal.status,
      approval: goal.approval,
    },
    body: `# ${goal.id}: ${goal.title}\n\n## Boundary\n${goal.boundary.map((item) => `- ${item}`).join("\n")}\n\n## Acceptance criteria\n${goal.acceptanceCriteria.map((item) => `- ${item}`).join("\n")}\n`,
  };
}

function roleDocument(
  role: Role,
  revision: number,
  now: UtcIsoTimestamp,
): GovernanceDocument {
  return {
    frontMatter: {
      schema_version: 1,
      document_type: "role",
      revision,
      created_at: now,
      updated_at: now,
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

function taskDocument(
  task: Task,
  revision: number,
  now: UtcIsoTimestamp,
): GovernanceDocument {
  return {
    frontMatter: {
      schema_version: 1,
      document_type: "task",
      revision,
      created_at: now,
      updated_at: now,
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
        outstanding_issues: task.completion.outstandingIssues,
        handoff: task.completion.handoff,
      },
    },
    body: `# ${task.id}: ${task.title}\n\n## Purpose\n${task.purpose}\n\n## Scope\n${task.scope.map((item) => `- ${item}`).join("\n")}\n\n## Dependencies\n${task.dependencies.length === 0 ? "- None" : task.dependencies.map((item) => `- ${item}`).join("\n")}\n`,
  };
}

export class PlanningDraftService {
  private readonly registryFactory: ProjectRegistryFactory;
  private readonly now: () => UtcIsoTimestamp;

  public constructor(options: PlanningDraftServiceOptions = {}) {
    this.registryFactory =
      options.registryFactory ?? (() => new ProjectRegistryRepository());
    this.now =
      options.now ?? (() => new Date().toISOString() as UtcIsoTimestamp);
  }

  public async get(
    input: unknown,
  ): Promise<PlanningDraftResult<PlanningDraftSnapshot | null>> {
    const project = await this.project(input);
    if (!project.ok) return project;
    const current = await this.readDraft(project.value);
    if (!current.ok) {
      return current.error.code === "draft_not_found"
        ? { ok: true, value: null }
        : current;
    }
    return { ok: true, value: this.snapshot(project.value, current.value) };
  }

  public async generate(
    input: unknown,
  ): Promise<PlanningDraftResult<PlanningDraftSnapshot>> {
    const project = await this.project(input);
    if (!project.ok) return project;
    const current = await this.readDraft(project.value);
    if (!current.ok && current.error.code !== "draft_not_found") return current;
    if (current.ok && current.value.status !== "rejected") {
      return { ok: true, value: this.snapshot(project.value, current.value) };
    }
    const spec = await this.readSpec(project.value);
    if (!spec.ok) return spec;
    const generated = await this.buildDraft(project.value, spec.value);
    const expected = current.ok ? current.value.version : null;
    const previous = current.ok ? current.value.document : null;
    const now = this.now();
    const written = await new GovernanceRepository(
      project.value.rootPath,
    ).write(
      planningDraftRelativePath,
      draftDocument(
        generated,
        "candidate",
        (current.ok ? current.value.version.revision : 0) + 1,
        current.ok
          ? (current.value.document.frontMatter.created_at as UtcIsoTimestamp)
          : now,
        now,
        previous,
      ),
      expected,
    );
    if (!written.ok)
      return failure(
        "write_failed",
        written.error.message,
        written.error.details,
      );
    return {
      ok: true,
      value: {
        projectKey: project.value.projectKey,
        projectRoot: project.value.rootPath,
        draft: generated,
        status: "candidate",
        revision: written.value.version.revision,
        hash: written.value.version.hash,
      },
    };
  }

  public async edit(
    input: unknown,
  ): Promise<PlanningDraftResult<PlanningDraftSnapshot>> {
    if (!isRecord(input) || !isRecord(input.draft)) {
      return failure(
        "invalid_input",
        "An editable planning draft is required.",
      );
    }
    const project = await this.project(input);
    if (!project.ok) return project;
    const current = await this.readDraft(project.value);
    if (!current.ok) return current;
    const merged = {
      ...current.value.draft,
      ...(input.draft as Record<string, unknown>),
    } as PlanningDraft;
    const validated = validatePlanningDraft(merged);
    if (!validated.ok) return failure("invalid_draft", validated.error.message);
    const expected = this.expectedVersion(input, current.value.version);
    if (!expected.ok) return expected;
    const now = this.now();
    const written = await new GovernanceRepository(
      project.value.rootPath,
    ).write(
      planningDraftRelativePath,
      draftDocument(
        validated.value,
        "candidate",
        current.value.version.revision + 1,
        current.value.document.frontMatter.created_at as UtcIsoTimestamp,
        now,
        current.value.document,
      ),
      expected.value,
    );
    if (!written.ok)
      return failure(
        "revision_mismatch",
        written.error.message,
        written.error.details,
      );
    return {
      ok: true,
      value: {
        projectKey: project.value.projectKey,
        projectRoot: project.value.rootPath,
        draft: validated.value,
        status: "candidate",
        revision: written.value.version.revision,
        hash: written.value.version.hash,
      },
    };
  }

  public async reject(
    input: unknown,
  ): Promise<PlanningDraftResult<PlanningDraftSnapshot>> {
    if (!isRecord(input) || !text(input.note))
      return failure("invalid_input", "A rejection note is required.");
    const project = await this.project(input);
    if (!project.ok) return project;
    const current = await this.readDraft(project.value);
    if (!current.ok) return current;
    const expected = this.expectedVersion(input, current.value.version);
    if (!expected.ok) return expected;
    const now = this.now();
    const written = await new GovernanceRepository(
      project.value.rootPath,
    ).write(
      planningDraftRelativePath,
      draftDocument(
        current.value.draft,
        "rejected",
        current.value.version.revision + 1,
        current.value.document.frontMatter.created_at as UtcIsoTimestamp,
        now,
        current.value.document,
      ),
      expected.value,
    );
    if (!written.ok)
      return failure(
        "revision_mismatch",
        written.error.message,
        written.error.details,
      );
    return {
      ok: true,
      value: {
        projectKey: project.value.projectKey,
        projectRoot: project.value.rootPath,
        draft: current.value.draft,
        status: "rejected",
        revision: written.value.version.revision,
        hash: written.value.version.hash,
      },
    };
  }

  public async approve(input: unknown): Promise<
    PlanningDraftResult<
      Readonly<{
        readonly projectKey: string;
        readonly goalIds: readonly GoalId[];
        readonly taskIds: readonly TaskId[];
        readonly readyTaskId: TaskId;
        readonly writtenFiles: readonly string[];
        readonly recoveryPlan: readonly string[];
      }>
    >
  > {
    if (!isRecord(input) || !text(input.note))
      return failure("invalid_input", "An approval note is required.");
    const project = await this.project(input);
    if (!project.ok) return project;
    const current = await this.readDraft(project.value);
    if (!current.ok) return current;
    if (current.value.status !== "candidate")
      return failure(
        "approval_required",
        "Only a candidate planning draft can be approved.",
      );
    const expected = this.expectedVersion(input, current.value.version);
    if (!expected.ok) return expected;
    const spec = await this.readSpec(project.value);
    if (!spec.ok) return spec;
    if (
      spec.value.version.revision !== current.value.draft.specRevision ||
      spec.value.version.hash !== current.value.draft.specHash
    ) {
      return failure(
        "conflict",
        "The approved Spec changed; regenerate the planning draft.",
      );
    }
    const built = this.buildFormalRecords(current.value.draft);
    if (!built.ok) return built;
    const targetPaths = [
      ...built.value.goals.map(
        (item) => `.personal-workspace/goals/${item.goal.id}.md`,
      ),
      ...built.value.roles.map(
        (item) => `.personal-workspace/roles/${item.key}.md`,
      ),
      ...built.value.tasks.map(
        (item) => `.personal-workspace/tasks/${item.task.id}.md`,
      ),
    ];
    const conflicts = await this.existingPaths(
      project.value.rootPath,
      targetPaths,
    );
    if (conflicts.length > 0)
      return failure(
        "conflict",
        "Formal target files already exist; no files were overwritten.",
        conflicts,
      );
    const writtenFiles: string[] = [];
    try {
      for (const item of built.value.goals) {
        await this.writeFormal(
          project.value.rootPath,
          item.path,
          item.document,
          null,
        );
        writtenFiles.push(item.path);
      }
      for (const item of built.value.roles) {
        await this.writeFormal(
          project.value.rootPath,
          item.path,
          item.document,
          null,
        );
        writtenFiles.push(item.path);
      }
      for (const item of built.value.tasks) {
        await this.writeFormal(
          project.value.rootPath,
          item.path,
          item.document,
          null,
        );
        writtenFiles.push(item.path);
      }
      await this.writeAudit(project.value.rootPath, [
        ...built.value.goals.map((item) => item.goal.id),
        ...built.value.tasks.map((item) => item.task.id),
      ]);
      const now = this.now();
      const marked = await new GovernanceRepository(
        project.value.rootPath,
      ).write(
        planningDraftRelativePath,
        draftDocument(
          current.value.draft,
          "approved",
          current.value.version.revision + 1,
          current.value.document.frontMatter.created_at as UtcIsoTimestamp,
          now,
          current.value.document,
          { note: input.note, at: now },
        ),
        expected.value,
      );
      if (!marked.ok) throw new Error(marked.error.message);
      writtenFiles.push(planningDraftRelativePath);
    } catch (error) {
      return failure(
        "partial_write",
        "Planning approval partially wrote formal records; inspect the listed files before retrying.",
        [error instanceof Error ? error.message : String(error)],
        [
          "Do not retry approval with the same draft until the listed files are inspected.",
          `Preserve or remove only the files created by this approval: ${writtenFiles.join(", ") || "none"}.`,
          "Reload the planning draft and formal facts, then create a new recovery decision.",
        ],
      );
    }
    return {
      ok: true,
      value: {
        projectKey: project.value.projectKey,
        goalIds: built.value.goals.map((item) => item.goal.id),
        taskIds: built.value.tasks.map((item) => item.task.id),
        readyTaskId: built.value.readyTaskId,
        writtenFiles,
        recoveryPlan: [],
      },
    };
  }

  private async project(
    input: unknown,
  ): Promise<PlanningDraftResult<ProjectIndexRecord>> {
    if (!isRecord(input) || typeof input.projectKey !== "string")
      return failure("invalid_input", "A projectKey is required.");
    let registry: ProjectRegistryRepository;
    try {
      registry = this.registryFactory();
    } catch (error) {
      return failure(
        "registry_failed",
        "The project registry could not be opened.",
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
        (item) => item.projectKey === input.projectKey && !item.archived,
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

  private snapshot(
    project: ProjectIndexRecord,
    file: DraftFile,
  ): PlanningDraftSnapshot {
    return {
      projectKey: project.projectKey,
      projectRoot: project.rootPath,
      draft: file.draft,
      status: file.status,
      revision: file.version.revision,
      hash: file.version.hash,
    };
  }

  private async readDraft(
    project: ProjectIndexRecord,
  ): Promise<PlanningDraftResult<DraftFile>> {
    const read = await new GovernanceRepository(project.rootPath).read(
      planningDraftRelativePath,
    );
    if (!read.ok)
      return read.error.code === "not_found"
        ? failure("draft_not_found", "No planning draft exists yet.")
        : failure("write_failed", read.error.message, read.error.details);
    const parsed = parseDraft(read.value.document);
    if (!parsed.ok) return parsed;
    return {
      ok: true,
      value: { ...parsed.value, version: read.value.version },
    };
  }

  private async readSpec(
    project: ProjectIndexRecord,
  ): Promise<PlanningDraftResult<SpecSource>> {
    const read = await new GovernanceRepository(project.rootPath).read(
      ".personal-workspace/stages/03-spec/03-spec.md",
    );
    if (!read.ok)
      return failure(
        "spec_not_approved",
        "An approved Spec is required before planning.",
      );
    const fm = read.value.document.frontMatter;
    if (
      fm.document_type !== "stage_artifact" ||
      fm.artifact_status !== "approved" ||
      fm.stage !== "spec"
    )
      return failure(
        "spec_not_approved",
        "The Spec stage artifact is not approved.",
      );
    const payload = validateStageArtifactPayload("spec", fm.payload);
    if (!payload.ok) return failure("spec_not_approved", payload.error.message);
    const requirements = strings(payload.value.requirements);
    const constraints = strings(payload.value.constraints);
    const validationPlan = strings(payload.value.validationPlan);
    if (
      requirements === null ||
      constraints === null ||
      validationPlan === null
    )
      return failure(
        "spec_not_approved",
        "The approved Spec has invalid planning fields.",
      );
    return {
      ok: true,
      value: {
        requirements,
        constraints,
        validationPlan,
        version: read.value.version,
      },
    };
  }

  private async buildDraft(
    project: ProjectIndexRecord,
    spec: SpecSource,
  ): Promise<PlanningDraft> {
    const [goalIds, taskIds] = await Promise.all([
      this.nextIds(project.rootPath, "GOAL", 1),
      this.nextIds(project.rootPath, "TASK", spec.requirements.length),
    ]);
    const goalId = goalIds[0] as GoalId;
    const roles = [getRole("executor"), getRole("reviewer")]
      .filter((role): role is Role => role !== undefined)
      .map(cloneRole);
    const goal: PlanningGoalDraft = {
      id: goalId,
      title: `Implement approved Spec: ${spec.requirements[0]}`,
      boundary: [...spec.requirements],
      risks: [...spec.constraints],
      acceptanceCriteria: [...spec.validationPlan],
    };
    const tasks: PlanningTaskDraft[] = spec.requirements.map(
      (requirement, index) => {
        const id = taskIds[index] as TaskId;
        const dependency = index === 0 ? [] : [taskIds[index - 1] as TaskId];
        return {
          id,
          title: `Implement: ${requirement}`,
          goalId,
          currentRole: "executor",
          dependencies: dependency,
          purpose: requirement,
          scope: [requirement],
          outputs: [`Verified implementation for: ${requirement}`],
          acceptanceCriteria: [...spec.validationPlan],
          requiredFiles: [".personal-workspace/stages/03-spec/03-spec.md"],
          onDemandFiles: [
            ".personal-workspace/project.md",
            ".personal-workspace/workflow.md",
          ],
          allowedPaths: ["apps", "packages", "e2e"],
          forbiddenPaths: [".personal-workspace", ".git", "main"],
          verificationCommands: ["npm run verify"],
        };
      },
    );
    const draft: PlanningDraft = {
      schemaVersion: 1,
      kind: "planning_draft",
      specRevision: spec.version.revision,
      specHash: spec.version.hash,
      goalDrafts: [goal],
      roleDrafts: roles,
      taskDrafts: tasks,
      dependencyGraph: Object.fromEntries(
        tasks.map((task) => [task.id, [...task.dependencies]]),
      ),
      handoff:
        "Review, edit, and approve this planning draft before formal facts become executable.",
    };
    const validated = validatePlanningDraft(draft);
    if (!validated.ok) throw new Error(validated.error.message);
    return validated.value;
  }

  private async nextIds(
    root: string,
    prefix: "GOAL" | "TASK",
    count: number,
  ): Promise<readonly string[]> {
    const directory = resolve(
      root,
      `.personal-workspace/${prefix === "GOAL" ? "goals" : "tasks"}`,
    );
    let names: readonly string[] = [];
    try {
      names = await readdir(directory);
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ))
        throw error;
    }
    const max = names
      .filter((name) => new RegExp(`^${prefix}-\\d{3}\\.md$`).test(name))
      .reduce(
        (value, name) =>
          Math.max(
            value,
            Number(name.slice(prefix.length + 1, prefix.length + 4)),
          ),
        0,
      );
    return Array.from(
      { length: count },
      (_, index) => `${prefix}-${String(max + index + 1).padStart(3, "0")}`,
    );
  }

  private expectedVersion(
    input: Record<string, unknown>,
    actual: FileVersion,
  ): PlanningDraftResult<FileVersion> {
    if (
      input.revision !== undefined &&
      Number(input.revision) !== actual.revision
    )
      return failure("revision_mismatch", "Planning draft revision is stale.");
    if (input.hash !== undefined && input.hash !== actual.hash)
      return failure("revision_mismatch", "Planning draft hash is stale.");
    return { ok: true, value: actual };
  }

  private async existingPaths(
    root: string,
    paths: readonly string[],
  ): Promise<readonly string[]> {
    const conflicts: string[] = [];
    for (const path of paths) {
      const read = await new GovernanceRepository(root).read(path);
      if (read.ok) conflicts.push(path);
      else if (read.error.code !== "not_found")
        conflicts.push(`${path}: ${read.error.message}`);
    }
    return conflicts;
  }

  private buildFormalRecords(draft: PlanningDraft): PlanningDraftResult<
    Readonly<{
      readonly goals: readonly Readonly<{
        readonly goal: Goal;
        readonly path: string;
        readonly document: GovernanceDocument;
      }>[];
      readonly roles: readonly Readonly<{
        readonly key: RoleKey;
        readonly path: string;
        readonly document: GovernanceDocument;
      }>[];
      readonly tasks: readonly Readonly<{
        readonly task: Task;
        readonly path: string;
        readonly document: GovernanceDocument;
      }>[];
      readonly readyTaskId: TaskId;
    }>
  > {
    const first = firstDependencyFreeTask(draft);
    if (first === null)
      return failure(
        "invalid_draft",
        "The planning draft has no dependency-free first task.",
      );
    const now = this.now();
    const goals: { goal: Goal; path: string; document: GovernanceDocument }[] =
      [];
    for (const item of draft.goalDrafts) {
      const proposal = createGoalProposal({
        id: item.id,
        title: item.title,
        boundary: item.boundary,
        risks: item.risks,
        acceptanceCriteria: item.acceptanceCriteria,
      });
      if (!proposal.ok) return failure("invalid_draft", proposal.error.message);
      const approved = decideGoal(proposal.value, {
        approved: true,
        decidedAt: now,
      });
      if (!approved.ok) return failure("invalid_draft", approved.error.message);
      goals.push({
        goal: approved.value,
        path: `.personal-workspace/goals/${item.id}.md`,
        document: goalDocument(approved.value, 1, now),
      });
    }
    const roles = draft.roleDrafts.map((role) => ({
      key: role.key,
      path: `.personal-workspace/roles/${role.key}.md`,
      document: roleDocument(role, 1, now),
    }));
    const goal = goals[0]?.goal;
    if (goal === undefined)
      return failure("invalid_draft", "At least one goal draft is required.");
    const tasks: { task: Task; path: string; document: GovernanceDocument }[] =
      [];
    for (const item of draft.taskDrafts) {
      const created = createTaskDraft(goal, {
        id: item.id,
        title: item.title,
        currentRole: item.currentRole,
        dependencies: item.dependencies,
        purpose: item.purpose,
        scope: item.scope,
        outputs: item.outputs,
        acceptanceCriteria: item.acceptanceCriteria,
        requiredFiles: item.requiredFiles,
        onDemandFiles: item.onDemandFiles,
        associatedDecisions: [],
        allowedPaths: item.allowedPaths,
        forbiddenPaths: item.forbiddenPaths,
        run: {
          mode: "governed-local",
          gitBranch: `task/${item.id}`,
          worktree: `.worktrees/${item.id}`,
          verificationCommands: item.verificationCommands,
        },
        evidence: [".personal-workspace/stages/03-spec/03-spec.md"],
        completion: {
          output: "Pending execution.",
          tests: ["npm run verify"],
          outstandingIssues: [],
          handoff: "Await execution and independent review.",
        },
      });
      if (!created.ok) return failure("invalid_draft", created.error.message);
      const ready =
        item.id === first
          ? markTaskReady(goal, created.value)
          : { ok: true as const, value: created.value };
      if (!ready.ok) return failure("invalid_draft", ready.error.message);
      tasks.push({
        task: ready.value,
        path: `.personal-workspace/tasks/${item.id}.md`,
        document: taskDocument(ready.value, 1, now),
      });
    }
    return { ok: true, value: { goals, roles, tasks, readyTaskId: first } };
  }

  private async writeFormal(
    root: string,
    path: string,
    document: GovernanceDocument,
    expected: FileVersion | null,
  ): Promise<void> {
    const written = await new GovernanceRepository(root).write(
      path,
      document,
      expected,
    );
    if (!written.ok) throw new Error(`${path}: ${written.error.message}`);
  }

  private async writeAudit(
    root: string,
    relatedObjectIds: readonly string[],
  ): Promise<void> {
    const repository = new AuditLogRepository(root);
    const current = await repository.readAll();
    if (!current.ok) throw new Error(current.error.message);
    const next =
      current.value.reduce(
        (max, event) => Math.max(max, Number(event.id.slice(5))),
        0,
      ) + 1;
    const id = parseFormalId(
      `EXEC-${String(next).padStart(3, "0")}`,
    ) as ExecutionId;
    const event = createAuditEvent({
      id,
      occurredAt: this.now(),
      type: "status_changed",
      actor: "user",
      action: "planning_approved",
      relatedObjectIds: relatedObjectIds as never,
      statusChange: {
        from: "draft",
        to: "ready",
        reason: "User approved the planning draft.",
      },
      details: {
        source: "planning_draft",
        task_count: relatedObjectIds.length,
      },
    });
    if (!event.ok) throw new Error(event.error.message);
    const appended = await repository.append(event.value);
    if (!appended.ok) throw new Error(appended.error.message);
  }
}
