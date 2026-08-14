import { readdir } from "node:fs/promises";

import {
  createApproval,
  decideApproval,
  approvalTypes,
  type Approval,
  type ApprovalDecision,
  type ApprovalOutcome,
  type ApprovalType,
} from "@personal-ai-operator/domain";
import {
  parseFormalId,
  type ExecutionId,
  type FormalId,
  type UtcIsoTimestamp,
} from "@personal-ai-operator/contracts";

import { GovernanceRepository } from "../files/governance-repository.js";
import type { GovernanceDocument } from "../files/governance-codec.js";
import { AuditLogRepository } from "../audit/audit-log-repository.js";
import { createAuditEvent } from "../audit/audit-event.js";
import {
  ProjectRegistryRepository,
  type ProjectIndexRecord,
} from "../registry/project-registry-repository.js";
import type { ProjectRegistryFactory } from "../projects/project-startup.js";

export type ApprovalOperation = "goal_acceptance" | "main_merge" | null;
export type ApprovalSnapshot = Readonly<{
  readonly revision: number;
  readonly hash: string;
}>;
export type ApprovalView = Readonly<{
  readonly approval: Approval;
  readonly approvalId: string;
  readonly operation: ApprovalOperation;
  readonly subjectSnapshot: ApprovalSnapshot;
  readonly currentSnapshot: ApprovalSnapshot | null;
  readonly stale: boolean;
  readonly relativePath: string;
}>;
export type ApprovalPage = Readonly<{
  readonly projectKey: string;
  readonly approvals: readonly ApprovalView[];
}>;
export type ApprovalResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: ApprovalError }>;
export type ApprovalErrorCode =
  | "invalid_input"
  | "registry_failed"
  | "project_not_found"
  | "invalid_approval"
  | "subject_not_found"
  | "expired_approval"
  | "revision_mismatch"
  | "write_failed"
  | "audit_failed";
export type ApprovalError = Readonly<{
  readonly code: ApprovalErrorCode;
  readonly message: string;
  readonly details: readonly string[];
}>;
export type ApprovalServiceOptions = Readonly<{
  readonly registryFactory?: ProjectRegistryFactory;
  readonly now?: () => UtcIsoTimestamp;
}>;

type Subject = Readonly<{
  readonly id: FormalId;
  readonly revision: number;
  readonly hash: string;
  readonly relativePath: string;
}>;

function failure<Value>(
  code: ApprovalErrorCode,
  message: string,
  details: readonly string[] = [],
): ApprovalResult<Value> {
  return { ok: false, error: { code, message, details } };
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function approvalType(value: unknown): value is ApprovalType {
  return (
    typeof value === "string" && approvalTypes.includes(value as ApprovalType)
  );
}
function operation(value: unknown): value is Exclude<ApprovalOperation, null> {
  return value === "goal_acceptance" || value === "main_merge";
}
function approvalId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^APPROVAL-\d{3}$/.test(value) &&
    Number(value.slice(9)) > 0
  );
}
function nextApprovalId(values: readonly string[]): string {
  const next =
    values.reduce((max, value) => Math.max(max, Number(value.slice(9))), 0) + 1;
  if (next > 999) throw new Error("No approval ID is available.");
  return `APPROVAL-${String(next).padStart(3, "0")}`;
}
function nextExecutionId(
  values: readonly { readonly id: string }[],
): ExecutionId {
  const next =
    values.reduce((max, value) => Math.max(max, Number(value.id.slice(5))), 0) +
    1;
  return parseFormalId(`EXEC-${String(next).padStart(3, "0")}`) as ExecutionId;
}
function approvalDocument(
  view: ApprovalView,
  createdAt: UtcIsoTimestamp,
  updatedAt: UtcIsoTimestamp,
  revision: number,
): GovernanceDocument {
  const approval = view.approval;
  return {
    frontMatter: {
      schema_version: 1,
      document_type: "approval",
      revision,
      created_at: createdAt,
      updated_at: updatedAt,
      id: view.approvalId,
      approval_type: approval.approvalType,
      operation: view.operation,
      subject_id: approval.subjectId,
      requested_by: approval.requestedBy,
      request: approval.request,
      status: approval.status,
      decision: approval.decision,
      subject_revision: view.subjectSnapshot.revision,
      subject_hash: view.subjectSnapshot.hash,
    },
    body: `# ${view.approvalId}: ${approval.request}\n\n- Subject: ${approval.subjectId}\n- Approval type: ${approval.approvalType}\n- Operation: ${view.operation ?? "general"}\n- Subject revision: ${view.subjectSnapshot.revision}\n- Subject hash: ${view.subjectSnapshot.hash}\n`,
  };
}

export class ApprovalService {
  private readonly registryFactory: ProjectRegistryFactory;
  private readonly now: () => UtcIsoTimestamp;
  public constructor(options: ApprovalServiceOptions = {}) {
    this.registryFactory =
      options.registryFactory ?? (() => new ProjectRegistryRepository());
    this.now =
      options.now ?? (() => new Date().toISOString() as UtcIsoTimestamp);
  }
  public async getApprovals(
    projectKey: string,
  ): Promise<ApprovalResult<ApprovalPage>> {
    const project = await this.findProject(projectKey);
    if (!project.ok) return project;
    const names = await this.names(project.value.rootPath);
    if (!names.ok) return names;
    const views: ApprovalView[] = [];
    for (const name of names.value) {
      const read = await new GovernanceRepository(project.value.rootPath).read(
        `.personal-workspace/approvals/${name}`,
      );
      if (!read.ok)
        return failure(
          "invalid_approval",
          read.error.message,
          read.error.details,
        );
      const parsed = await this.parseView(
        project.value.rootPath,
        read.value.document,
        read.value.version.revision,
        read.value.version.hash,
        `.personal-workspace/approvals/${name}`,
      );
      if (!parsed.ok) return parsed;
      views.push(parsed.value);
    }
    return {
      ok: true,
      value: {
        projectKey,
        approvals: views.toSorted((left, right) =>
          left.approvalId.localeCompare(right.approvalId),
        ),
      },
    };
  }
  public async request(input: unknown): Promise<ApprovalResult<ApprovalView>> {
    if (
      !record(input) ||
      !text(input.projectKey) ||
      !approvalType(input.approvalType) ||
      !text(input.subjectId) ||
      !text(input.request)
    ) {
      return failure(
        "invalid_input",
        "Project, approval type, subject, and request are required.",
      );
    }
    const selectedOperation: ApprovalOperation =
      input.operation === undefined || input.operation === null
        ? null
        : operation(input.operation)
          ? input.operation
          : null;
    if (
      input.operation !== undefined &&
      input.operation !== null &&
      selectedOperation === null
    )
      return failure("invalid_input", "Approval operation is invalid.");
    if (
      selectedOperation !== null &&
      input.approvalType !== "short_term_goal_acceptance_and_main_merge"
    )
      return failure(
        "invalid_input",
        "Goal acceptance and main merge operations require the fifth approval gate.",
      );
    const project = await this.findProject(input.projectKey);
    if (!project.ok) return project;
    const subject = await this.findSubject(
      project.value.rootPath,
      input.subjectId,
    );
    if (!subject.ok) return subject;
    const existing = await this.getApprovals(input.projectKey);
    if (!existing.ok) return existing;
    const id = nextApprovalId(
      existing.value.approvals.map((item) => item.approvalId),
    );
    const createdAt = this.now();
    const created = createApproval({
      id: "TASK-001",
      revision: 1,
      createdAt,
      updatedAt: createdAt,
      relatedObjectIds: [subject.value.id],
      approvalType: input.approvalType,
      subjectId: subject.value.id,
      requestedBy: input.requestedBy === "system" ? "system" : "agent",
      request: input.request,
    });
    if (!created.ok) return failure("invalid_approval", created.error.message);
    const view: ApprovalView = {
      approval: created.value,
      approvalId: id,
      operation: selectedOperation,
      subjectSnapshot: {
        revision: subject.value.revision,
        hash: subject.value.hash,
      },
      currentSnapshot: subject.value,
      stale: false,
      relativePath: `.personal-workspace/approvals/${id}.md`,
    };
    const written = await new GovernanceRepository(
      project.value.rootPath,
    ).write(
      view.relativePath,
      approvalDocument(view, createdAt, createdAt, 1),
      null,
    );
    if (!written.ok)
      return failure(
        "write_failed",
        written.error.message,
        written.error.details,
      );
    const audited = await this.audit(
      project.value.rootPath,
      "approval_requested",
      [subject.value.id],
      { approval_id: id, approval_type: created.value.approvalType },
    );
    if (!audited.ok) return audited;
    return {
      ok: true,
      value: {
        ...view,
        currentSnapshot: subject.value,
        relativePath: view.relativePath,
      },
    };
  }
  public async decide(input: unknown): Promise<ApprovalResult<ApprovalView>> {
    if (
      !record(input) ||
      !text(input.projectKey) ||
      !approvalId(input.approvalId) ||
      !["approved", "modified", "rejected"].includes(String(input.outcome)) ||
      !text(input.note)
    )
      return failure(
        "invalid_input",
        "Project, approval ID, outcome, and note are required.",
      );
    const project = await this.findProject(input.projectKey);
    if (!project.ok) return project;
    const relativePath = `.personal-workspace/approvals/${input.approvalId}.md`;
    const read = await new GovernanceRepository(project.value.rootPath).read(
      relativePath,
    );
    if (!read.ok)
      return failure(
        "invalid_approval",
        read.error.message,
        read.error.details,
      );
    const parsed = await this.parseView(
      project.value.rootPath,
      read.value.document,
      read.value.version.revision,
      read.value.version.hash,
      relativePath,
    );
    if (!parsed.ok) return parsed;
    if (parsed.value.stale)
      return failure(
        "expired_approval",
        "Approval no longer authorizes the changed subject.",
        [parsed.value.approval.subjectId],
      );
    const decided = decideApproval(parsed.value.approval, {
      decidedBy: "user",
      outcome: input.outcome as ApprovalOutcome,
      decidedAt: this.now(),
      note: input.note,
    } satisfies ApprovalDecision);
    if (!decided.ok) return failure("invalid_approval", decided.error.message);
    const view: ApprovalView = { ...parsed.value, approval: decided.value };
    const written = await new GovernanceRepository(
      project.value.rootPath,
    ).write(
      relativePath,
      approvalDocument(
        view,
        String(read.value.document.frontMatter.created_at) as UtcIsoTimestamp,
        this.now(),
        read.value.version.revision + 1,
      ),
      read.value.version,
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
    const audited = await this.audit(
      project.value.rootPath,
      `approval_${input.outcome}`,
      [parsed.value.approval.subjectId],
      {
        approval_id: input.approvalId,
        operation: parsed.value.operation ?? "general",
      },
    );
    if (!audited.ok) return audited;
    return {
      ok: true,
      value: {
        ...view,
        approval: decided.value,
        currentSnapshot: parsed.value.currentSnapshot,
      },
    };
  }
  private async parseView(
    root: string,
    document: GovernanceDocument,
    revision: number,
    hash: string,
    relativePath: string,
  ): Promise<ApprovalResult<ApprovalView>> {
    const fm = document.frontMatter;
    if (
      fm.document_type !== "approval" ||
      !approvalId(fm.id) ||
      !approvalType(fm.approval_type) ||
      !text(fm.subject_id) ||
      !text(fm.request) ||
      typeof fm.subject_revision !== "number" ||
      !text(fm.subject_hash)
    )
      return failure(
        "invalid_approval",
        "Approval fact document has invalid metadata.",
      );
    const subject = await this.findSubject(root, fm.subject_id);
    if (!subject.ok && subject.error.code !== "subject_not_found")
      return subject;
    const current = subject.ok
      ? { revision: subject.value.revision, hash: subject.value.hash }
      : null;
    const approval: Approval = {
      id: "TASK-001",
      revision,
      status:
        fm.status === "completed"
          ? "completed"
          : fm.status === "cancelled"
            ? "cancelled"
            : "draft",
      createdAt: String(fm.created_at) as UtcIsoTimestamp,
      updatedAt: String(fm.updated_at) as UtcIsoTimestamp,
      relatedObjectIds: [
        subject.ok ? subject.value.id : parseFormalId(fm.subject_id),
      ],
      approvalType: fm.approval_type,
      subjectId: parseFormalId(fm.subject_id),
      requestedBy: fm.requested_by === "system" ? "system" : "agent",
      request: fm.request,
      decision: record(fm.decision)
        ? {
            decidedBy: "user",
            outcome: fm.decision.outcome as ApprovalOutcome,
            decidedAt: String(fm.decision.decidedAt) as UtcIsoTimestamp,
            note: String(fm.decision.note),
          }
        : null,
    };
    return {
      ok: true,
      value: {
        approval,
        approvalId: fm.id,
        operation:
          fm.operation === "goal_acceptance" || fm.operation === "main_merge"
            ? fm.operation
            : null,
        subjectSnapshot: {
          revision: fm.subject_revision,
          hash: fm.subject_hash,
        },
        currentSnapshot: current,
        stale:
          current === null ||
          current.revision !== fm.subject_revision ||
          current.hash !== fm.subject_hash,
        relativePath,
      },
    };
  }
  private async findSubject(
    root: string,
    id: string,
  ): Promise<ApprovalResult<Subject>> {
    const prefix = id.startsWith("GOAL-")
      ? "goals"
      : id.startsWith("TASK-")
        ? "tasks"
        : null;
    if (prefix === null)
      return failure(
        "subject_not_found",
        "Approval subject must be a goal or task.",
      );
    const relativePath = `.personal-workspace/${prefix}/${id}.md`;
    const read = await new GovernanceRepository(root).read(relativePath);
    if (!read.ok)
      return failure("subject_not_found", "Approval subject was not found.", [
        id,
      ]);
    return {
      ok: true,
      value: {
        id: parseFormalId(id),
        revision: read.value.version.revision,
        hash: read.value.version.hash,
        relativePath,
      },
    };
  }
  private async names(
    root: string,
  ): Promise<ApprovalResult<readonly string[]>> {
    try {
      return {
        ok: true,
        value: (await readdir(`${root}/.personal-workspace/approvals`))
          .filter((name) => /^APPROVAL-\d{3}\.md$/.test(name))
          .toSorted(),
      };
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return { ok: true, value: [] };
      return failure(
        "invalid_approval",
        "Approval records could not be listed.",
        [String(error)],
      );
    }
  }
  private async audit(
    root: string,
    action: string,
    relatedObjectIds: readonly FormalId[],
    details: Readonly<Record<string, string>>,
  ): Promise<ApprovalResult<true>> {
    const repo = new AuditLogRepository(root);
    const current = await repo.readAll();
    if (!current.ok)
      return failure(
        "audit_failed",
        current.error.message,
        current.error.details,
      );
    const created = createAuditEvent({
      id: nextExecutionId(current.value),
      occurredAt: this.now(),
      type: action.includes("rejected") ? "failure" : "recovery",
      actor: "user",
      action,
      relatedObjectIds,
      details,
    });
    if (!created.ok) return failure("audit_failed", created.error.message);
    const appended = await repo.append(created.value);
    return appended.ok
      ? { ok: true, value: true }
      : failure("audit_failed", appended.error.message, appended.error.details);
  }
  private async findProject(
    projectKey: string,
  ): Promise<ApprovalResult<ProjectIndexRecord>> {
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
}
