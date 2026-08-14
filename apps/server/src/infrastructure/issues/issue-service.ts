import { readdir } from "node:fs/promises";
import {
  canTransitionTask,
  createDecision,
  createIssue,
  decideDecision,
  deriveIssuePausePlan,
  linkDecisionToIssue,
  recordIssueDiscussion,
  resolveIssue,
  type Decision,
  type Issue,
  type IssueImpact,
  type IssueSeverity,
  type TaskStatus,
} from "@personal-ai-operator/domain";
import {
  parseFormalId,
  parseUtcIsoTimestamp,
  type ExecutionId,
  type FormalId,
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

export type IssueSnapshot = Readonly<{
  readonly issue: Issue;
  readonly revision: number;
  readonly hash: string;
}>;
export type IssueDecisionSnapshot = Readonly<{
  readonly decision: Decision;
  readonly revision: number;
  readonly hash: string;
}>;
export type IssuePage = Readonly<{
  readonly projectKey: string;
  readonly projectRoot: string;
  readonly issues: readonly IssueSnapshot[];
  readonly decisions: readonly IssueDecisionSnapshot[];
}>;
export type IssueActionResult = Readonly<{
  readonly projectKey: string;
  readonly issue: IssueSnapshot;
  readonly decision: IssueDecisionSnapshot | null;
  readonly pausedTaskIds: readonly TaskId[];
  readonly missingTaskIds: readonly TaskId[];
  readonly executionChainPaused: boolean;
}>;
export type IssueResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: IssueError }>;
export type IssueErrorCode =
  | "invalid_input"
  | "registry_failed"
  | "project_not_found"
  | "invalid_issue"
  | "invalid_decision"
  | "not_found"
  | "revision_mismatch"
  | "write_failed"
  | "audit_failed";
export type IssueError = Readonly<{
  readonly code: IssueErrorCode;
  readonly message: string;
  readonly details: readonly string[];
}>;
export type IssueServiceOptions = Readonly<{
  readonly registryFactory?: ProjectRegistryFactory;
  readonly now?: () => UtcIsoTimestamp;
}>;

function failure<Value>(
  code: IssueErrorCode,
  message: string,
  details: readonly string[] = [],
): IssueResult<Value> {
  return { ok: false, error: { code, message, details } };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nowUtc(): UtcIsoTimestamp {
  return parseUtcIsoTimestamp(new Date().toISOString());
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function list(value: unknown, required = false): readonly string[] | null {
  if (!Array.isArray(value)) return required ? null : [];
  if (
    !value.every((item) => typeof item === "string" && item.trim().length > 0)
  )
    return null;
  const result = value.map((item) => (item as string).trim());
  return required && result.length === 0 ? null : result;
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
function formalIds(value: unknown): readonly FormalId[] | null {
  const values = list(value);
  if (values === null) return null;
  const result: FormalId[] = [];
  for (const item of values) {
    try {
      result.push(parseFormalId(item));
    } catch {
      return null;
    }
  }
  return result;
}
function issueSeverity(value: unknown): value is IssueSeverity {
  return (
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "blocker"
  );
}
function issueImpact(value: unknown): value is IssueImpact {
  return (
    value === "unknown" ||
    value === "task" ||
    value === "execution_chain" ||
    value === "goal"
  );
}
function issueStatus(value: unknown): value is Issue["status"] {
  return (
    value === "draft" ||
    value === "in_progress" ||
    value === "completed" ||
    value === "cancelled"
  );
}
function decisionStatus(value: unknown): value is Decision["status"] {
  return value === "draft" || value === "completed" || value === "cancelled";
}
function taskStatus(value: unknown): value is TaskStatus {
  return (
    value === "draft" ||
    value === "ready" ||
    value === "in_progress" ||
    value === "in_review" ||
    value === "completed" ||
    value === "blocked" ||
    value === "changes_requested" ||
    value === "paused" ||
    value === "cancelled"
  );
}

function parseIssue(document: GovernanceDocument): IssueResult<Issue> {
  const fm = document.frontMatter;
  let id: FormalId | null = null;
  try {
    id = parseFormalId(fm.id);
  } catch {
    id = null;
  }
  const taskValues = list(fm.affected_task_ids);
  const tasks = taskValues === null ? null : taskValues.map(taskId);
  const objects = formalIds(fm.affected_object_ids);
  const discussion = list(fm.discussion);
  const decisions = formalIds(fm.decision_ids);
  if (
    fm.document_type !== "issue" ||
    id === null ||
    !issueStatus(fm.status) ||
    !text(fm.title) ||
    !text(fm.description) ||
    !issueSeverity(fm.severity) ||
    !issueImpact(fm.impact) ||
    tasks === null ||
    tasks.some((item) => item === null) ||
    objects === null ||
    discussion === null ||
    decisions === null
  )
    return failure(
      "invalid_issue",
      "Issue fact document has invalid metadata.",
    );
  return {
    ok: true,
    value: {
      id,
      revision: Number(fm.revision),
      status: fm.status,
      createdAt: fm.created_at as UtcIsoTimestamp,
      updatedAt: fm.updated_at as UtcIsoTimestamp,
      relatedObjectIds: [...objects, ...(tasks as TaskId[])],
      title: fm.title.trim(),
      description: fm.description.trim(),
      severity: fm.severity,
      impact: fm.impact,
      affectedTaskIds: tasks as TaskId[],
      affectedObjectIds: objects,
      discussion,
      decisionIds: decisions as never[],
      recoveryPlan:
        fm.recovery_plan === null
          ? null
          : text(fm.recovery_plan)
            ? fm.recovery_plan.trim()
            : null,
      resolution:
        fm.resolution === null
          ? null
          : text(fm.resolution)
            ? fm.resolution.trim()
            : null,
    },
  };
}
function parseDecision(document: GovernanceDocument): IssueResult<Decision> {
  const fm = document.frontMatter;
  let id: FormalId | null = null;
  try {
    id = parseFormalId(fm.id);
  } catch {
    id = null;
  }
  const options = list(fm.options, true);
  let sourceIssueId: FormalId | null = null;
  if (fm.source_issue_id !== null) {
    try {
      sourceIssueId = parseFormalId(fm.source_issue_id);
    } catch {
      sourceIssueId = null;
    }
  }
  const decision = isRecord(fm.decision) ? fm.decision : null;
  if (
    fm.document_type !== "decision" ||
    id === null ||
    !id.startsWith("DEC-") ||
    !decisionStatus(fm.status) ||
    !text(fm.question) ||
    options === null ||
    !["agent", "user"].includes(fm.proposed_by as string) ||
    (fm.source_issue_id !== null && sourceIssueId === null)
  )
    return failure(
      "invalid_decision",
      "Decision fact document has invalid metadata.",
    );
  let userDecision: Decision["decision"] = null;
  if (decision !== null) {
    if (
      decision.decidedBy !== "user" ||
      !text(decision.selectedOption) ||
      !text(decision.rationale) ||
      !text(decision.decidedAt)
    )
      return failure("invalid_decision", "Decision metadata is invalid.");
    userDecision = {
      decidedBy: "user",
      selectedOption: decision.selectedOption,
      rationale: decision.rationale,
      decidedAt: decision.decidedAt as UtcIsoTimestamp,
    };
  }
  return {
    ok: true,
    value: {
      id: id as never,
      revision: Number(fm.revision),
      status: fm.status as Decision["status"],
      createdAt: fm.created_at as UtcIsoTimestamp,
      updatedAt: fm.updated_at as UtcIsoTimestamp,
      relatedObjectIds: sourceIssueId === null ? [] : [sourceIssueId],
      question: fm.question.trim(),
      options,
      proposedBy: fm.proposed_by as "agent" | "user",
      sourceIssueId,
      decision: userDecision,
    },
  };
}
function issueDocument(
  issue: Issue,
  createdAt: UtcIsoTimestamp,
  updatedAt: UtcIsoTimestamp,
): GovernanceDocument {
  return {
    frontMatter: {
      schema_version: 1,
      document_type: "issue",
      revision: issue.revision,
      created_at: createdAt,
      updated_at: updatedAt,
      id: issue.id,
      status: issue.status,
      title: issue.title,
      description: issue.description,
      severity: issue.severity,
      impact: issue.impact,
      affected_task_ids: issue.affectedTaskIds,
      affected_object_ids: issue.affectedObjectIds,
      discussion: issue.discussion,
      decision_ids: issue.decisionIds,
      recovery_plan: issue.recoveryPlan,
      resolution: issue.resolution,
    },
    body: `# ${issue.title}\n\n${issue.description}\n\n## Discussion\n${issue.discussion.map((entry) => `- ${entry}`).join("\n") || "- No discussion recorded."}\n`,
  };
}
function decisionDocument(
  decision: Decision,
  createdAt: UtcIsoTimestamp,
  updatedAt: UtcIsoTimestamp,
): GovernanceDocument {
  return {
    frontMatter: {
      schema_version: 1,
      document_type: "decision",
      revision: decision.revision,
      created_at: createdAt,
      updated_at: updatedAt,
      id: decision.id,
      status: decision.status,
      question: decision.question,
      options: decision.options,
      proposed_by: decision.proposedBy,
      source_issue_id: decision.sourceIssueId,
      decision: decision.decision,
    },
    body: `# ${decision.question}\n\n${decision.options.map((option) => `- ${option}`).join("\n")}\n`,
  };
}

export class IssueService {
  private readonly registryFactory: ProjectRegistryFactory;
  private readonly now: () => UtcIsoTimestamp;
  public constructor(options: IssueServiceOptions = {}) {
    this.registryFactory =
      options.registryFactory ?? (() => new ProjectRegistryRepository());
    this.now = options.now ?? nowUtc;
  }
  public async getIssues(projectKey: string): Promise<IssueResult<IssuePage>> {
    const project = await this.findProject(projectKey);
    if (!project.ok) return project;
    const issues = await this.readIssues(project.value);
    const decisions = await this.readDecisions(project.value);
    if (!issues.ok) return issues;
    if (!decisions.ok) return decisions;
    return {
      ok: true,
      value: {
        projectKey,
        projectRoot: project.value.rootPath,
        issues: issues.value,
        decisions: decisions.value,
      },
    };
  }
  public async create(input: unknown): Promise<IssueResult<IssueActionResult>> {
    if (
      !isRecord(input) ||
      typeof input.projectKey !== "string" ||
      !text(input.title) ||
      !text(input.description) ||
      !issueSeverity(input.severity) ||
      !issueImpact(input.impact)
    )
      return failure(
        "invalid_input",
        "Issue title, description, severity, and impact are required.",
      );
    const project = await this.findProject(input.projectKey);
    if (!project.ok) return project;
    const existing = await this.readIssues(project.value);
    if (!existing.ok) return existing;
    const id = this.nextId(existing.value.map((item) => item.issue.id));
    const taskValues = list(input.affectedTaskIds);
    const affectedTaskIds = taskValues === null ? null : taskValues.map(taskId);
    const affectedObjectIds = formalIds(input.affectedObjectIds);
    const discussion = list(input.discussion);
    if (
      affectedTaskIds === null ||
      affectedTaskIds.some((item) => item === null) ||
      affectedObjectIds === null ||
      discussion === null
    )
      return failure(
        "invalid_issue",
        "Issue impact targets and discussion entries are invalid.",
      );
    const created = createIssue({
      id: id as never,
      revision: 1,
      createdAt: this.now(),
      updatedAt: this.now(),
      relatedObjectIds: [],
      title: input.title,
      description: input.description,
      severity: input.severity,
      impact: input.impact,
      affectedTaskIds: affectedTaskIds as TaskId[],
      affectedObjectIds,
      discussion,
      recoveryPlan: text(input.recoveryPlan) ? input.recoveryPlan : null,
    });
    if (!created.ok) return failure("invalid_issue", created.error.message);
    const currentTask = activeIssueTaskId(input.currentTaskId) ?? null;
    const activeIssue: Issue = {
      ...created.value,
      status: "in_progress",
      affectedTaskIds:
        created.value.impact === "unknown" && currentTask !== null
          ? [currentTask]
          : created.value.affectedTaskIds,
    };
    const plan = deriveIssuePausePlan(activeIssue);
    if (!plan.ok) return failure("invalid_issue", plan.error.message);
    const written = await new GovernanceRepository(
      project.value.rootPath,
    ).write(
      `.personal-workspace/issues/${id}.md`,
      issueDocument(activeIssue, activeIssue.createdAt, activeIssue.updatedAt),
      null,
    );
    if (!written.ok)
      return failure(
        "write_failed",
        written.error.message,
        written.error.details,
      );
    const pauseTargets =
      plan.value.pauseExecutionChain && currentTask !== null
        ? [currentTask]
        : [...plan.value.pauseTaskIds];
    const paused = await this.pauseTasks(
      project.value.rootPath,
      pauseTargets,
      `Issue ${id} requires a pause.`,
    );
    const audited = await this.audit(
      project.value.rootPath,
      "issue_opened",
      [id, ...pauseTargets],
      {
        impact: activeIssue.impact,
        paused_task_ids: paused.paused.join(","),
        execution_chain_paused: plan.value.pauseExecutionChain,
      },
    );
    if (!audited.ok) return audited;
    return {
      ok: true,
      value: {
        projectKey: input.projectKey,
        issue: {
          issue: activeIssue,
          revision: written.value.version.revision,
          hash: written.value.version.hash,
        },
        decision: null,
        pausedTaskIds: paused.paused,
        missingTaskIds: paused.missing,
        executionChainPaused: plan.value.pauseExecutionChain,
      },
    };
  }
  public async discuss(input: unknown): Promise<IssueResult<IssueSnapshot>> {
    if (
      !isRecord(input) ||
      typeof input.projectKey !== "string" ||
      typeof input.issueId !== "string" ||
      !text(input.entry)
    )
      return failure(
        "invalid_input",
        "Issue, project, and discussion entry are required.",
      );
    const project = await this.findProject(input.projectKey);
    if (!project.ok) return project;
    const current = await this.findIssue(project.value, input.issueId);
    if (!current.ok) return current;
    const next = recordIssueDiscussion(current.value.issue, input.entry);
    if (!next.ok) return failure("invalid_issue", next.error.message);
    return this.writeIssue(project.value, current.value, next.value);
  }
  public async decide(input: unknown): Promise<IssueResult<IssueActionResult>> {
    if (
      !isRecord(input) ||
      typeof input.projectKey !== "string" ||
      typeof input.issueId !== "string" ||
      !text(input.question)
    )
      return failure(
        "invalid_input",
        "Issue, question, and decision options are required.",
      );
    const options = list(input.options, true);
    if (options === null)
      return failure("invalid_decision", "Decision options are required.");
    const project = await this.findProject(input.projectKey);
    if (!project.ok) return project;
    const issue = await this.findIssue(project.value, input.issueId);
    if (!issue.ok) return issue;
    const decisions = await this.readDecisions(project.value);
    if (!decisions.ok) return decisions;
    const id = this.nextId(decisions.value.map((item) => item.decision.id));
    const proposed = createDecision({
      id: id as never,
      revision: 1,
      createdAt: this.now(),
      updatedAt: this.now(),
      relatedObjectIds: [issue.value.issue.id],
      question: input.question,
      options,
      proposedBy: "agent",
      sourceIssueId: issue.value.issue.id,
    });
    if (!proposed.ok)
      return failure("invalid_decision", proposed.error.message);
    let decision = proposed.value;
    if (text(input.selectedOption)) {
      const decided = decideDecision(decision, {
        decidedBy: "user",
        selectedOption: input.selectedOption,
        rationale: text(input.rationale)
          ? input.rationale
          : "User decision recorded.",
        decidedAt: this.now(),
      });
      if (!decided.ok)
        return failure("invalid_decision", decided.error.message);
      decision = decided.value;
    }
    const decisionWrite = await new GovernanceRepository(
      project.value.rootPath,
    ).write(
      `.personal-workspace/decisions/${id}.md`,
      decisionDocument(decision, decision.createdAt, decision.updatedAt),
      null,
    );
    if (!decisionWrite.ok)
      return failure(
        "write_failed",
        decisionWrite.error.message,
        decisionWrite.error.details,
      );
    const linked = linkDecisionToIssue(issue.value.issue, decision.id);
    if (!linked.ok) return failure("invalid_issue", linked.error.message);
    const issueWrite = await this.writeIssue(project.value, issue.value, {
      ...linked.value,
      revision: issue.value.issue.revision + 1,
      updatedAt: this.now(),
    });
    if (!issueWrite.ok) return issueWrite;
    const audited = await this.audit(
      project.value.rootPath,
      "issue_decision_recorded",
      [issue.value.issue.id, decision.id],
      { selected_option: decision.decision?.selectedOption ?? "pending" },
    );
    if (!audited.ok) return audited;
    return {
      ok: true,
      value: {
        projectKey: input.projectKey,
        issue: issueWrite.value,
        decision: {
          decision,
          revision: decisionWrite.value.version.revision,
          hash: decisionWrite.value.version.hash,
        },
        pausedTaskIds: [],
        missingTaskIds: [],
        executionChainPaused: false,
      },
    };
  }
  public async recover(
    input: unknown,
  ): Promise<IssueResult<IssueActionResult>> {
    if (
      !isRecord(input) ||
      typeof input.projectKey !== "string" ||
      typeof input.issueId !== "string" ||
      !text(input.action) ||
      !text(input.rationale)
    )
      return failure(
        "invalid_input",
        "Recovery action and rationale are required.",
      );
    if (input.action !== "resume" && input.action !== "cancel")
      return failure(
        "invalid_input",
        "Recovery action must be resume or cancel.",
      );
    const project = await this.findProject(input.projectKey);
    if (!project.ok) return project;
    const issue = await this.findIssue(project.value, input.issueId);
    if (!issue.ok) return issue;
    const resolved = resolveIssue(issue.value.issue, input.rationale);
    if (!resolved.ok) return failure("invalid_issue", resolved.error.message);
    const written = await this.writeIssue(project.value, issue.value, {
      ...resolved.value,
      revision: issue.value.issue.revision + 1,
      updatedAt: this.now(),
    });
    if (!written.ok) return written;
    const resumed =
      input.action === "resume"
        ? await this.resumeTasks(
            project.value.rootPath,
            issue.value.issue.affectedTaskIds,
            `Recovered issue ${issue.value.issue.id}.`,
          )
        : { resumed: [], missing: [] };
    const audited = await this.audit(
      project.value.rootPath,
      "issue_recovered",
      [issue.value.issue.id, ...resumed.resumed],
      { action: input.action, resumed_task_ids: resumed.resumed.join(",") },
    );
    if (!audited.ok) return audited;
    return {
      ok: true,
      value: {
        projectKey: input.projectKey,
        issue: written.value,
        decision: null,
        pausedTaskIds: resumed.resumed,
        missingTaskIds: resumed.missing,
        executionChainPaused: false,
      },
    };
  }
  private nextId(ids: readonly FormalId[]): FormalId {
    const next =
      ids.reduce(
        (max, id) => Math.max(max, Number(id.slice(id.indexOf("-") + 1))),
        0,
      ) + 1;
    return parseFormalId(`DEC-${String(next).padStart(3, "0")}`);
  }
  private async findProject(
    projectKey: string,
  ): Promise<IssueResult<ProjectIndexRecord>> {
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
        ? failure("project_not_found", "Project is not registered or archived.")
        : { ok: true, value: project };
    } finally {
      registry.close();
    }
  }
  private async readIssues(
    project: ProjectIndexRecord,
  ): Promise<IssueResult<readonly IssueSnapshot[]>> {
    return this.readRecords(
      project,
      "issues",
      parseIssue,
      "invalid_issue",
    ) as Promise<IssueResult<readonly IssueSnapshot[]>>;
  }
  private async readDecisions(
    project: ProjectIndexRecord,
  ): Promise<IssueResult<readonly IssueDecisionSnapshot[]>> {
    return this.readRecords(
      project,
      "decisions",
      parseDecision,
      "invalid_decision",
    ) as Promise<IssueResult<readonly IssueDecisionSnapshot[]>>;
  }
  private async readRecords<Value>(
    project: ProjectIndexRecord,
    collection: "issues" | "decisions",
    parser: (document: GovernanceDocument) => IssueResult<Value>,
    code: "invalid_issue" | "invalid_decision",
  ): Promise<IssueResult<readonly (IssueSnapshot | IssueDecisionSnapshot)[]>> {
    let names: string[];
    try {
      names = (
        await readdir(`${project.rootPath}/.personal-workspace/${collection}`)
      ).filter(
        (name) =>
          name.endsWith(".md") && !name.toLowerCase().includes("readme"),
      );
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return { ok: true, value: [] };
      return failure(code, "Governance records could not be listed.", [
        error instanceof Error ? error.message : String(error),
      ]);
    }
    const result: (IssueSnapshot | IssueDecisionSnapshot)[] = [];
    for (const name of names.sort()) {
      const read = await new GovernanceRepository(project.rootPath).read(
        `.personal-workspace/${collection}/${name}`,
      );
      if (!read.ok)
        return failure(code, read.error.message, read.error.details);
      const parsed = parser(read.value.document);
      if (!parsed.ok) return parsed;
      result.push(
        collection === "issues"
          ? {
              issue: parsed.value as Issue,
              revision: read.value.version.revision,
              hash: read.value.version.hash,
            }
          : {
              decision: parsed.value as Decision,
              revision: read.value.version.revision,
              hash: read.value.version.hash,
            },
      );
    }
    return { ok: true, value: result };
  }
  private async findIssue(
    project: ProjectIndexRecord,
    id: string,
  ): Promise<IssueResult<IssueSnapshot>> {
    const issues = await this.readIssues(project);
    if (!issues.ok) return issues;
    const found = issues.value.find((item) => item.issue.id === id);
    return found === undefined
      ? failure("not_found", "Issue was not found.")
      : { ok: true, value: found };
  }
  private async writeIssue(
    project: ProjectIndexRecord,
    current: IssueSnapshot,
    issue: Issue,
  ): Promise<IssueResult<IssueSnapshot>> {
    const written = await new GovernanceRepository(project.rootPath).write(
      `.personal-workspace/issues/${issue.id}.md`,
      issueDocument(issue, current.issue.createdAt, issue.updatedAt),
      { revision: current.revision, hash: current.hash },
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
      value: {
        issue,
        revision: written.value.version.revision,
        hash: written.value.version.hash,
      },
    };
  }
  private async pauseTasks(
    root: string,
    ids: readonly TaskId[],
    reason: string,
  ): Promise<{
    readonly paused: readonly TaskId[];
    readonly missing: readonly TaskId[];
  }> {
    const paused: TaskId[] = [];
    const missing: TaskId[] = [];
    for (const id of ids) {
      const relative = `.personal-workspace/tasks/${id}.md`;
      const read = await new GovernanceRepository(root).read(relative);
      if (!read.ok) {
        missing.push(id);
        continue;
      }
      const current = read.value.document.frontMatter.status;
      if (!taskStatus(current) || !canTransitionTask(current, "paused"))
        continue;
      const document: GovernanceDocument = {
        frontMatter: {
          ...read.value.document.frontMatter,
          revision: read.value.version.revision + 1,
          updated_at: this.now(),
          status: "paused",
          pause_reason: reason,
        },
        body: read.value.document.body,
      };
      const written = await new GovernanceRepository(root).write(
        relative,
        document,
        read.value.version,
      );
      if (written.ok) paused.push(id);
    }
    return { paused, missing };
  }
  private async resumeTasks(
    root: string,
    ids: readonly TaskId[],
    reason: string,
  ): Promise<{
    readonly resumed: readonly TaskId[];
    readonly missing: readonly TaskId[];
  }> {
    const resumed: TaskId[] = [];
    const missing: TaskId[] = [];
    for (const id of ids) {
      const relative = `.personal-workspace/tasks/${id}.md`;
      const read = await new GovernanceRepository(root).read(relative);
      if (!read.ok) {
        missing.push(id);
        continue;
      }
      if (read.value.document.frontMatter.status !== "paused") continue;
      const document: GovernanceDocument = {
        frontMatter: {
          ...read.value.document.frontMatter,
          revision: read.value.version.revision + 1,
          updated_at: this.now(),
          status: "in_progress",
          recovery_reason: reason,
        },
        body: read.value.document.body,
      };
      const written = await new GovernanceRepository(root).write(
        relative,
        document,
        read.value.version,
      );
      if (written.ok) resumed.push(id);
    }
    return { resumed, missing };
  }
  private async audit(
    root: string,
    action: string,
    related: readonly FormalId[],
    details: Readonly<Record<string, string | boolean>>,
  ): Promise<IssueResult<true>> {
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
    const id = parseFormalId(
      `EXEC-${String(next).padStart(3, "0")}`,
    ) as ExecutionId;
    const created = createAuditEvent({
      id,
      occurredAt: this.now(),
      type: action === "issue_opened" ? "status_changed" : "recovery",
      actor: "user",
      action,
      relatedObjectIds: related,
      executionId: id,
      statusChange:
        action === "issue_opened"
          ? {
              from: "draft",
              to: "in_progress",
              reason: "Issue impact was recorded and pause policy was applied.",
            }
          : null,
      details,
    });
    if (!created.ok) return failure("audit_failed", created.error.message);
    const appended = await repository.append(created.value);
    return appended.ok
      ? { ok: true, value: true }
      : failure("audit_failed", appended.error.message, appended.error.details);
  }
}

function activeIssueTaskId(value: unknown): TaskId | null {
  return text(value) ? taskId(value) : null;
}
