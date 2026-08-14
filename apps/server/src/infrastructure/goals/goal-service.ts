import { readdir } from "node:fs/promises";

import {
  createGoalProposal,
  decideGoal,
  type Goal,
  type GoalStatus,
} from "@personal-ai-operator/domain";
import {
  parseFormalId,
  type GoalId,
  type UtcIsoTimestamp,
} from "@personal-ai-operator/contracts";

import { GovernanceRepository } from "../files/governance-repository.js";
import type { GovernanceDocument } from "../files/governance-codec.js";
import {
  ProjectRegistryRepository,
  type ProjectIndexRecord,
} from "../registry/project-registry-repository.js";
import type { ProjectRegistryFactory } from "../projects/project-startup.js";

export type GoalTaskDraft = Readonly<{ readonly title: string }>;

export type GoalSnapshot = Readonly<{
  readonly goal: Goal;
  readonly taskDrafts: readonly GoalTaskDraft[];
  readonly revision: number;
  readonly hash: string;
}>;

export type GoalView = Readonly<{
  readonly projectKey: string;
  readonly projectRoot: string;
  readonly goals: readonly GoalSnapshot[];
}>;

export type GoalProposal = Readonly<{
  readonly projectKey: string;
  readonly proposal: GoalSnapshot;
}>;

export type GoalDecision = Readonly<{
  readonly projectKey: string;
  readonly changed: boolean;
  readonly goal: GoalSnapshot;
}>;

export type GoalErrorCode =
  | "invalid_input"
  | "registry_failed"
  | "project_not_found"
  | "invalid_goal"
  | "revision_mismatch"
  | "write_failed";

export type GoalError = Readonly<{
  readonly code: GoalErrorCode;
  readonly message: string;
  readonly details: readonly string[];
}>;

export type GoalResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: GoalError }>;

export type GoalServiceOptions = Readonly<{
  readonly registryFactory?: ProjectRegistryFactory;
  readonly now?: () => UtcIsoTimestamp;
}>;

type GoalFile = Readonly<{
  readonly record: ProjectIndexRecord;
  readonly relativePath: string;
  readonly document: GovernanceDocument;
  readonly goal: Goal;
  readonly taskDrafts: readonly GoalTaskDraft[];
  readonly revision: number;
  readonly hash: string;
}>;

function failure<Value>(
  code: GoalErrorCode,
  message: string,
  details: readonly string[] = [],
): GoalResult<Value> {
  return { ok: false, error: { code, message, details } };
}

function currentTimestamp(): UtcIsoTimestamp {
  return new Date().toISOString() as UtcIsoTimestamp;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringList(
  value: unknown,
  required: boolean,
): readonly string[] | null {
  if (!Array.isArray(value)) return required ? null : [];
  if (!value.every((item) => typeof item === "string")) return null;
  const result = value.map((item) => item.trim());
  if (
    required &&
    (result.length === 0 || result.some((item) => item.length === 0))
  ) {
    return null;
  }
  if (result.some((item) => item.length === 0)) return null;
  return result;
}

function taskDrafts(value: unknown): readonly GoalTaskDraft[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  if (!value.every((item) => isRecord(item) && nonEmptyString(item.title))) {
    return null;
  }
  return value.map((item) => ({ title: (item.title as string).trim() }));
}

function goalId(value: unknown): GoalId | null {
  if (
    typeof value !== "string" ||
    !/^GOAL-\d{3}$/.test(value) ||
    Number(value.slice(5)) < 1
  )
    return null;
  try {
    const parsed = parseFormalId(value);
    return parsed.startsWith("GOAL-") ? (parsed as GoalId) : null;
  } catch {
    return null;
  }
}

function parseGoal(document: GovernanceDocument): GoalResult<Goal> {
  const frontMatter = document.frontMatter;
  const id = goalId(frontMatter.id);
  const title = frontMatter.title;
  const boundary = stringList(frontMatter.boundary, true);
  const risks = stringList(frontMatter.risks, false);
  const acceptanceCriteria = stringList(frontMatter.acceptance_criteria, true);
  const status = frontMatter.status;
  const approval = frontMatter.approval;
  if (
    frontMatter.document_type !== "goal" ||
    id === null ||
    !nonEmptyString(title) ||
    boundary === null ||
    risks === null ||
    acceptanceCriteria === null ||
    ![
      "draft",
      "ready",
      "in_progress",
      "completed",
      "paused",
      "cancelled",
    ].includes(status as string)
  ) {
    return failure("invalid_goal", "Goal fact document has invalid metadata.");
  }
  let parsedApproval: Goal["approval"] = null;
  if (approval !== null) {
    if (
      !isRecord(approval) ||
      approval.decidedBy !== "user" ||
      typeof approval.approved !== "boolean" ||
      !nonEmptyString(approval.decidedAt)
    ) {
      return failure("invalid_goal", "Goal approval metadata is invalid.");
    }
    parsedApproval = {
      decidedBy: "user",
      approved: approval.approved,
      decidedAt: approval.decidedAt as UtcIsoTimestamp,
    };
  }
  return {
    ok: true,
    value: {
      id,
      title: title.trim(),
      boundary,
      risks,
      acceptanceCriteria,
      proposedBy: "project-lead-agent",
      status: status as GoalStatus,
      approval: parsedApproval,
    },
  };
}

function parseTaskDrafts(
  document: GovernanceDocument,
): readonly GoalTaskDraft[] | null {
  return taskDrafts(document.frontMatter.task_drafts);
}

function bodyFor(
  goal: Goal,
  taskDraftsValue: readonly GoalTaskDraft[],
): string {
  const lines = [
    `# ${goal.id}: ${goal.title}`,
    "",
    "## Boundary",
    ...goal.boundary.map((item) => `- ${item}`),
    "",
    "## Risks",
    ...(goal.risks.length > 0
      ? goal.risks.map((item) => `- ${item}`)
      : ["- None recorded"]),
    "",
    "## Acceptance criteria",
    ...goal.acceptanceCriteria.map((item) => `- ${item}`),
    "",
    "## Task drafts",
    ...(taskDraftsValue.length > 0
      ? taskDraftsValue.map((item) => `- ${item.title}`)
      : ["- No task draft is approved by this record."]),
    "",
    goal.status === "ready"
      ? "User approval recorded. The goal is ready but has not been started automatically."
      : goal.status === "cancelled"
        ? "User rejected this goal proposal."
        : "This goal record is awaiting a user decision.",
  ];
  return `${lines.join("\n")}\n`;
}

function toSnapshot(file: GoalFile): GoalSnapshot {
  return {
    goal: file.goal,
    taskDrafts: file.taskDrafts,
    revision: file.revision,
    hash: file.hash,
  };
}

export class GoalService {
  private readonly registryFactory: ProjectRegistryFactory;
  private readonly now: () => UtcIsoTimestamp;

  public constructor(options: GoalServiceOptions = {}) {
    this.registryFactory =
      options.registryFactory ?? (() => new ProjectRegistryRepository());
    this.now = options.now ?? currentTimestamp;
  }

  public async getGoals(projectKey: string): Promise<GoalResult<GoalView>> {
    const project = await this.findProject(projectKey);
    if (!project.ok) return project;
    const files = await this.readFiles(project.value);
    if (!files.ok) return files;
    return {
      ok: true,
      value: {
        projectKey,
        projectRoot: project.value.rootPath,
        goals: files.value.map(toSnapshot),
      },
    };
  }

  public async propose(input: unknown): Promise<GoalResult<GoalProposal>> {
    if (!isRecord(input))
      return failure("invalid_input", "Goal proposal input must be an object.");
    const projectKey =
      typeof input.projectKey === "string" ? input.projectKey : null;
    const source = isRecord(input.goal) ? input.goal : input;
    if (projectKey === null)
      return failure("invalid_input", "A projectKey is required.");
    const project = await this.findProject(projectKey);
    if (!project.ok) return project;
    const files = await this.readFiles(project.value);
    if (!files.ok) return files;
    const proposal = this.makeProposal(source, files.value);
    if (!proposal.ok) return proposal;
    return { ok: true, value: { projectKey, proposal: proposal.value } };
  }

  public async decide(input: unknown): Promise<GoalResult<GoalDecision>> {
    if (!isRecord(input))
      return failure("invalid_input", "Goal decision input must be an object.");
    const projectKey =
      typeof input.projectKey === "string" ? input.projectKey : null;
    const source = isRecord(input.goal) ? input.goal : input;
    if (projectKey === null || typeof input.approved !== "boolean") {
      return failure(
        "invalid_input",
        "A projectKey and user approval decision are required.",
      );
    }
    const project = await this.findProject(projectKey);
    if (!project.ok) return project;
    const files = await this.readFiles(project.value);
    if (!files.ok) return files;
    const proposal = this.makeProposal(source, files.value);
    if (!proposal.ok) return proposal;
    const decidedAt =
      typeof input.decidedAt === "string" ? input.decidedAt : this.now();
    const existing = files.value.find(
      (file) => file.goal.id === proposal.value.goal.id,
    );
    if (existing !== undefined && existing.goal.status !== "draft") {
      return failure(
        "invalid_goal",
        "Only a draft goal can receive a user decision.",
      );
    }
    const decided = decideGoal(proposal.value.goal, {
      approved: input.approved,
      decidedAt: decidedAt as UtcIsoTimestamp,
    });
    if (!decided.ok) return failure("invalid_goal", decided.error.message);
    const expected =
      existing === undefined
        ? null
        : { revision: existing.revision, hash: existing.hash };
    const createdAt = existing?.document.frontMatter.created_at ?? this.now();
    const document: GovernanceDocument = {
      frontMatter: {
        schema_version: 1,
        document_type: "goal",
        revision: (existing?.revision ?? 0) + 1,
        created_at: createdAt,
        updated_at: this.now(),
        id: decided.value.id,
        title: decided.value.title,
        boundary: decided.value.boundary,
        risks: decided.value.risks,
        acceptance_criteria: decided.value.acceptanceCriteria,
        proposed_by: decided.value.proposedBy,
        status: decided.value.status,
        approval: decided.value.approval,
        task_drafts: proposal.value.taskDrafts,
      },
      body: bodyFor(decided.value, proposal.value.taskDrafts),
    };
    const written = await new GovernanceRepository(
      project.value.rootPath,
    ).write(
      `.personal-workspace/goals/${decided.value.id}.md`,
      document,
      expected,
    );
    if (!written.ok) {
      return failure(
        written.error.code === "revision_mismatch" ||
          written.error.code === "hash_mismatch"
          ? "revision_mismatch"
          : "write_failed",
        written.error.message,
        written.error.details,
      );
    }
    const snapshot: GoalSnapshot = {
      goal: decided.value,
      taskDrafts: proposal.value.taskDrafts,
      revision: written.value.version.revision,
      hash: written.value.version.hash,
    };
    return { ok: true, value: { projectKey, changed: true, goal: snapshot } };
  }

  private makeProposal(
    source: Record<string, unknown>,
    files: readonly GoalFile[],
  ): GoalResult<GoalSnapshot> {
    const id = source.id === undefined ? this.nextId(files) : goalId(source.id);
    const boundary = stringList(source.boundary, true);
    const risks = stringList(source.risks, false);
    const acceptanceCriteria = stringList(
      source.acceptanceCriteria ?? source.acceptance_criteria,
      true,
    );
    const drafts = taskDrafts(source.taskDrafts ?? source.task_drafts);
    if (
      id === null ||
      boundary === null ||
      risks === null ||
      acceptanceCriteria === null ||
      drafts === null ||
      !nonEmptyString(source.title)
    ) {
      return failure(
        "invalid_goal",
        "Goal title, boundary, and acceptance criteria are required.",
      );
    }
    const created = createGoalProposal({
      id,
      title: source.title,
      boundary,
      risks,
      acceptanceCriteria,
    });
    if (!created.ok) return failure("invalid_goal", created.error.message);
    return {
      ok: true,
      value: { goal: created.value, taskDrafts: drafts, revision: 0, hash: "" },
    };
  }

  private nextId(files: readonly GoalFile[]): GoalId {
    const next =
      files.reduce(
        (largest, file) => Math.max(largest, Number(file.goal.id.slice(5))),
        0,
      ) + 1;
    return `GOAL-${String(next).padStart(3, "0")}` as GoalId;
  }

  private async findProject(
    projectKey: string,
  ): Promise<GoalResult<ProjectIndexRecord>> {
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

  private async readFiles(
    project: ProjectIndexRecord,
  ): Promise<GoalResult<readonly GoalFile[]>> {
    const directory = `${project.rootPath}/.personal-workspace/goals`;
    let names: string[];
    try {
      names = (await readdir(directory)).filter((name) =>
        /^GOAL-\d{3}\.md$/.test(name),
      );
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return { ok: true, value: [] };
      return failure("invalid_goal", "Goal facts could not be listed.", [
        error instanceof Error ? error.message : String(error),
      ]);
    }
    const files: GoalFile[] = [];
    for (const name of names.sort()) {
      const relativePath = `.personal-workspace/goals/${name}`;
      const read = await new GovernanceRepository(project.rootPath).read(
        relativePath,
      );
      if (!read.ok)
        return failure("invalid_goal", read.error.message, read.error.details);
      const parsed = parseGoal(read.value.document);
      if (!parsed.ok) return parsed;
      const parsedDrafts = parseTaskDrafts(read.value.document);
      if (parsedDrafts === null)
        return failure("invalid_goal", "Goal task drafts are invalid.");
      files.push({
        record: project,
        relativePath,
        document: read.value.document,
        goal: parsed.value,
        taskDrafts: parsedDrafts,
        revision: read.value.version.revision,
        hash: read.value.version.hash,
      });
    }
    return { ok: true, value: files };
  }
}
