import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

import {
  createAuditEvent,
  type AuditEventActor,
  type AuditEventType,
  type AuditStatusChange,
} from "../audit/audit-event.js";
import { AuditLogRepository } from "../audit/audit-log-repository.js";
import {
  stageArtifactRelativePath,
  type PreflightStage,
  type StageArtifactPayload,
  validateStageArtifactPayload,
  validateStageReview,
  type StageReviewDecision,
  type StageReviewInput,
} from "@personal-ai-operator/domain";
import {
  parseFormalId,
  type ExecutionId,
  type UtcIsoTimestamp,
} from "@personal-ai-operator/contracts";

import {
  GovernanceRepository,
  type FileVersion,
  type GovernanceRepositoryError,
  type GovernanceSnapshot,
} from "../files/governance-repository.js";
import type { GovernanceDocument } from "../files/governance-codec.js";

const CANDIDATE_DIRECTORY = ".personal-workspace/stage-candidates";
const REVIEW_DIRECTORY = ".personal-workspace/stage-reviews";
const APPROVAL_DIRECTORY = ".personal-workspace/stage-approvals";

export type StageCandidate = Readonly<{
  readonly stageRunId: string;
  readonly stage: PreflightStage;
  readonly payload: StageArtifactPayload;
  readonly body: string;
  readonly relativePath: string;
  readonly version: FileVersion;
}>;

export type StageReview = Readonly<{
  readonly stageRunId: string;
  readonly stage: PreflightStage;
  readonly decision: StageReviewDecision;
  readonly findings: readonly string[];
  readonly requiredChanges: readonly string[];
  readonly verificationEvidence: readonly string[];
  readonly candidateVersion: FileVersion;
  readonly relativePath: string;
  readonly version: FileVersion;
}>;

export type ApprovedStageArtifact = Readonly<{
  readonly stageRunId: string;
  readonly stage: PreflightStage;
  readonly payload: StageArtifactPayload;
  readonly body: string;
  readonly relativePath: string;
  readonly version: FileVersion;
}>;

export type StageApprovalDecision =
  "approved" | "changes_requested" | "cancelled";

export type StageApprovalRecord = Readonly<{
  readonly approvalId: string;
  readonly stageRunId: string;
  readonly stage: PreflightStage;
  readonly decision: StageApprovalDecision;
  readonly note: string;
  readonly subjectSnapshot: FileVersion | null;
  readonly relativePath: string;
  readonly version: FileVersion;
}>;

export type StageArtifactCandidateInput = Readonly<{
  readonly stageRunId: string;
  readonly stage: PreflightStage;
  readonly payload: unknown;
  readonly body: string;
  readonly expectedCandidate: FileVersion | null;
}>;

export type StageArtifactReviewInput = Readonly<
  StageReviewInput & {
    readonly expectedCandidate: FileVersion;
    readonly expectedReview: FileVersion | null;
  }
>;

export type StageArtifactDecisionInput = Readonly<{
  readonly stageRunId: string;
  readonly stage: PreflightStage;
  readonly decision: StageApprovalDecision;
  readonly note: string;
  readonly expectedCandidate: FileVersion;
  readonly expectedReview: FileVersion;
  readonly expectedFormal: FileVersion | null;
}>;

export type StageArtifactServiceErrorCode =
  | "invalid_input"
  | "invalid_stage_artifact"
  | "invalid_stage_review"
  | "candidate_not_found"
  | "review_not_found"
  | "conflict"
  | "approval_required"
  | "write_failed"
  | "audit_failed";

export type StageArtifactServiceError = Readonly<{
  readonly code: StageArtifactServiceErrorCode;
  readonly message: string;
  readonly details: readonly string[];
  readonly expected?: FileVersion | null;
  readonly actual?: FileVersion | null;
}>;

export type StageArtifactServiceResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: StageArtifactServiceError }>;

export type StageArtifactServiceOptions = Readonly<{
  readonly now?: () => UtcIsoTimestamp;
}>;

function failure<Value>(
  code: StageArtifactServiceErrorCode,
  message: string,
  details: readonly string[] = [],
  expected?: FileVersion | null,
  actual?: FileVersion | null,
): StageArtifactServiceResult<Value> {
  const error: StageArtifactServiceError = { code, message, details };
  if (expected === undefined && actual === undefined) {
    return { ok: false, error };
  }
  return {
    ok: false,
    error: {
      ...error,
      ...(expected === undefined ? {} : { expected }),
      ...(actual === undefined ? {} : { actual }),
    },
  };
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function mapRepositoryError<Value>(
  error: GovernanceRepositoryError,
  notFoundCode:
    | "candidate_not_found"
    | "review_not_found"
    | "write_failed" = "write_failed",
): StageArtifactServiceResult<Value> {
  if (error.code === "not_found") {
    return failure(notFoundCode, error.message, error.details);
  }
  if (error.code === "revision_mismatch" || error.code === "hash_mismatch") {
    return failure(
      "conflict",
      error.message,
      error.details,
      error.expected,
      error.actual,
    );
  }
  return failure("write_failed", error.message, error.details);
}

function sameVersion(
  expected: FileVersion | null,
  actual: FileVersion | null,
): boolean {
  return (
    (expected === null && actual === null) ||
    (expected !== null &&
      actual !== null &&
      expected.revision === actual.revision &&
      expected.hash === actual.hash)
  );
}

function candidatePath(stageRunId: string): string {
  return `${CANDIDATE_DIRECTORY}/${stageRunId}.md`;
}

function reviewPath(stageRunId: string): string {
  return `${REVIEW_DIRECTORY}/${stageRunId}.md`;
}

function approvalPath(approvalId: string): string {
  return `${APPROVAL_DIRECTORY}/${approvalId}.md`;
}

function stageError<Value>(
  result: ReturnType<typeof validateStageArtifactPayload>,
): StageArtifactServiceResult<Value> {
  return result.ok
    ? failure(
        "invalid_stage_artifact",
        "Unexpected valid stage artifact result.",
      )
    : failure("invalid_stage_artifact", result.error.message);
}

function candidateFromSnapshot(
  snapshot: GovernanceSnapshot,
  expectedStage: PreflightStage,
  expectedRunId: string,
): StageArtifactServiceResult<StageCandidate> {
  const frontMatter = snapshot.document.frontMatter;
  if (
    frontMatter.document_type !== "stage_candidate" ||
    frontMatter.artifact_status !== "candidate" ||
    frontMatter.stage !== expectedStage ||
    frontMatter.stage_run_id !== expectedRunId ||
    !text(snapshot.document.body)
  ) {
    return failure(
      "candidate_not_found",
      "The stage candidate record has invalid metadata.",
    );
  }
  const payload = validateStageArtifactPayload(
    expectedStage,
    frontMatter.payload,
  );
  if (!payload.ok) return stageError(payload);
  return {
    ok: true,
    value: {
      stageRunId: expectedRunId,
      stage: expectedStage,
      payload: payload.value,
      body: snapshot.document.body,
      relativePath: snapshot.relativePath,
      version: snapshot.version,
    },
  };
}

function reviewFromSnapshot(
  snapshot: GovernanceSnapshot,
  expectedStage: PreflightStage,
  expectedRunId: string,
): StageArtifactServiceResult<StageReview> {
  const frontMatter = snapshot.document.frontMatter;
  if (
    frontMatter.document_type !== "stage_review" ||
    frontMatter.stage !== expectedStage ||
    frontMatter.stage_run_id !== expectedRunId ||
    !text(frontMatter.decision) ||
    !Array.isArray(frontMatter.findings) ||
    !Array.isArray(frontMatter.required_changes) ||
    !Array.isArray(frontMatter.verification_evidence) ||
    typeof frontMatter.candidate_revision !== "number" ||
    !text(frontMatter.candidate_hash)
  ) {
    return failure(
      "review_not_found",
      "The stage review record has invalid metadata.",
    );
  }
  const decision = frontMatter.decision;
  if (
    decision !== "accepted" &&
    decision !== "changes_requested" &&
    decision !== "cancelled"
  ) {
    return failure(
      "invalid_stage_review",
      "The stage review decision is invalid.",
    );
  }
  const review = validateStageReview({
    stageRunId: expectedRunId,
    stage: expectedStage,
    decision,
    findings: frontMatter.findings.filter(
      (item): item is string => typeof item === "string",
    ),
    requiredChanges: frontMatter.required_changes.filter(
      (item): item is string => typeof item === "string",
    ),
    verificationEvidence: frontMatter.verification_evidence.filter(
      (item): item is string => typeof item === "string",
    ),
  });
  if (!review.ok) return failure("invalid_stage_review", review.error.message);
  return {
    ok: true,
    value: {
      ...review.value,
      candidateVersion: {
        revision: frontMatter.candidate_revision,
        hash: frontMatter.candidate_hash,
      },
      relativePath: snapshot.relativePath,
      version: snapshot.version,
    },
  };
}

function formalFromSnapshot(
  snapshot: GovernanceSnapshot,
  expectedStage: PreflightStage,
  expectedRunId: string,
): StageArtifactServiceResult<ApprovedStageArtifact> {
  const frontMatter = snapshot.document.frontMatter;
  if (
    frontMatter.document_type !== "stage_artifact" ||
    frontMatter.artifact_status !== "approved" ||
    frontMatter.stage !== expectedStage ||
    frontMatter.stage_run_id !== expectedRunId ||
    !text(snapshot.document.body)
  ) {
    return failure(
      "invalid_stage_artifact",
      "The formal stage artifact has invalid metadata.",
    );
  }
  const payload = validateStageArtifactPayload(
    expectedStage,
    frontMatter.payload,
  );
  if (!payload.ok) return stageError(payload);
  return {
    ok: true,
    value: {
      stageRunId: expectedRunId,
      stage: expectedStage,
      payload: payload.value,
      body: snapshot.document.body,
      relativePath: snapshot.relativePath,
      version: snapshot.version,
    },
  };
}

function nextRevision(current: GovernanceSnapshot | null): number {
  return current === null ? 1 : current.version.revision + 1;
}

function createdAt(
  current: GovernanceSnapshot | null,
  now: UtcIsoTimestamp,
): UtcIsoTimestamp {
  return current === null
    ? now
    : (String(current.document.frontMatter.created_at) as UtcIsoTimestamp);
}

function isDecision(value: unknown): value is StageApprovalDecision {
  return (
    value === "approved" ||
    value === "changes_requested" ||
    value === "cancelled"
  );
}

export class StageArtifactService {
  private readonly projectRoot: string;
  private readonly now: () => UtcIsoTimestamp;
  private readonly repository: GovernanceRepository;

  public constructor(
    projectRoot: string,
    options: StageArtifactServiceOptions = {},
  ) {
    this.projectRoot = resolve(projectRoot);
    this.now =
      options.now ?? (() => new Date().toISOString() as UtcIsoTimestamp);
    this.repository = new GovernanceRepository(this.projectRoot);
  }

  public async readFormal(
    stage: PreflightStage,
    stageRunId: string,
  ): Promise<StageArtifactServiceResult<ApprovedStageArtifact | null>> {
    const path = stageArtifactRelativePath(stage);
    const read = await this.repository.read(path);
    if (!read.ok && read.error.code === "not_found")
      return { ok: true, value: null };
    if (!read.ok) return mapRepositoryError(read.error);
    return formalFromSnapshot(read.value, stage, stageRunId);
  }

  public async readCandidate(
    stage: PreflightStage,
    stageRunId: string,
  ): Promise<StageArtifactServiceResult<StageCandidate>> {
    const read = await this.repository.read(candidatePath(stageRunId));
    if (!read.ok) return mapRepositoryError(read.error, "candidate_not_found");
    return candidateFromSnapshot(read.value, stage, stageRunId);
  }

  public async readReview(
    stage: PreflightStage,
    stageRunId: string,
  ): Promise<StageArtifactServiceResult<StageReview>> {
    const read = await this.repository.read(reviewPath(stageRunId));
    if (!read.ok) return mapRepositoryError(read.error, "review_not_found");
    return reviewFromSnapshot(read.value, stage, stageRunId);
  }

  public async submitCandidate(
    input: StageArtifactCandidateInput,
  ): Promise<StageArtifactServiceResult<StageCandidate>> {
    if (
      !text(input.stageRunId) ||
      !text(input.body) ||
      input.expectedCandidate === undefined
    ) {
      return failure(
        "invalid_input",
        "Stage candidate requires a run ID, body and an expected candidate snapshot.",
      );
    }
    const payload = validateStageArtifactPayload(input.stage, input.payload);
    if (!payload.ok) return stageError(payload);
    const path = candidatePath(input.stageRunId);
    const current = await this.repository.read(path);
    if (!current.ok && current.error.code !== "not_found")
      return mapRepositoryError(current.error);
    const currentSnapshot = current.ok ? current.value : null;
    if (
      !sameVersion(input.expectedCandidate, currentSnapshot?.version ?? null)
    ) {
      return failure(
        "conflict",
        "The stage candidate changed since it was read; refusing overwrite.",
        [],
        input.expectedCandidate,
        currentSnapshot?.version ?? null,
      );
    }
    const now = this.now();
    const document: GovernanceDocument = {
      frontMatter: {
        ...(currentSnapshot?.document.frontMatter ?? {}),
        schema_version: 1,
        document_type: "stage_candidate",
        artifact_status: "candidate",
        stage: input.stage,
        stage_run_id: input.stageRunId,
        revision: nextRevision(currentSnapshot),
        created_at: createdAt(currentSnapshot, now),
        updated_at: now,
        payload: payload.value,
      },
      body: input.body,
    };
    const written = await this.repository.write(
      path,
      document,
      input.expectedCandidate,
    );
    if (!written.ok) return mapRepositoryError(written.error);
    const parsed = candidateFromSnapshot(
      written.value,
      input.stage,
      input.stageRunId,
    );
    if (!parsed.ok) return parsed;
    const audited = await this.audit(
      "stage_candidate_submitted",
      "agent",
      input.stage,
      input.stageRunId,
      "recovery",
      { candidate_revision: written.value.version.revision },
    );
    return audited.ok ? parsed : audited;
  }

  public async reviewCandidate(
    input: StageArtifactReviewInput,
  ): Promise<StageArtifactServiceResult<StageReview>> {
    const candidate = await this.readCandidate(input.stage, input.stageRunId);
    if (!candidate.ok) return candidate;
    if (!sameVersion(input.expectedCandidate, candidate.value.version)) {
      return failure(
        "conflict",
        "The stage candidate changed before review; refusing to review it.",
        [],
        input.expectedCandidate,
        candidate.value.version,
      );
    }
    const validated = validateStageReview(input);
    if (!validated.ok)
      return failure("invalid_stage_review", validated.error.message);
    const path = reviewPath(input.stageRunId);
    const current = await this.repository.read(path);
    if (!current.ok && current.error.code !== "not_found")
      return mapRepositoryError(current.error);
    const currentSnapshot = current.ok ? current.value : null;
    if (!sameVersion(input.expectedReview, currentSnapshot?.version ?? null)) {
      return failure(
        "conflict",
        "The stage review changed since it was read; refusing overwrite.",
        [],
        input.expectedReview,
        currentSnapshot?.version ?? null,
      );
    }
    const now = this.now();
    const document: GovernanceDocument = {
      frontMatter: {
        ...(currentSnapshot?.document.frontMatter ?? {}),
        schema_version: 1,
        document_type: "stage_review",
        stage: input.stage,
        stage_run_id: input.stageRunId,
        revision: nextRevision(currentSnapshot),
        created_at: createdAt(currentSnapshot, now),
        updated_at: now,
        decision: validated.value.decision,
        findings: validated.value.findings,
        required_changes: validated.value.requiredChanges,
        verification_evidence: validated.value.verificationEvidence,
        candidate_revision: candidate.value.version.revision,
        candidate_hash: candidate.value.version.hash,
      },
      body: "# Stage review\n\nThis is a structured, read-only review result.\n",
    };
    const written = await this.repository.write(
      path,
      document,
      input.expectedReview,
    );
    if (!written.ok) return mapRepositoryError(written.error);
    const parsed = reviewFromSnapshot(
      written.value,
      input.stage,
      input.stageRunId,
    );
    if (!parsed.ok) return parsed;
    const audited = await this.audit(
      "stage_review_recorded",
      "reviewer",
      input.stage,
      input.stageRunId,
      "recovery",
      { decision: input.decision },
    );
    return audited.ok ? parsed : audited;
  }

  public async decide(
    input: StageArtifactDecisionInput,
  ): Promise<StageArtifactServiceResult<StageApprovalRecord>> {
    if (
      !text(input.stageRunId) ||
      !text(input.note) ||
      !isDecision(input.decision)
    ) {
      return failure(
        "invalid_input",
        "Stage approval requires a run ID, decision and note.",
      );
    }
    const candidate = await this.readCandidate(input.stage, input.stageRunId);
    if (!candidate.ok) return candidate;
    const review = await this.readReview(input.stage, input.stageRunId);
    if (!review.ok) return review;
    if (!sameVersion(input.expectedCandidate, candidate.value.version)) {
      return failure(
        "conflict",
        "The candidate changed before approval.",
        [],
        input.expectedCandidate,
        candidate.value.version,
      );
    }
    if (!sameVersion(input.expectedReview, review.value.version)) {
      return failure(
        "conflict",
        "The review changed before approval.",
        [],
        input.expectedReview,
        review.value.version,
      );
    }
    if (input.decision === "approved" && review.value.decision !== "accepted") {
      return failure(
        "approval_required",
        "A stage can only be approved after an accepted review result.",
      );
    }

    const formalPath = stageArtifactRelativePath(input.stage);
    const formal = await this.repository.read(formalPath);
    if (!formal.ok && formal.error.code !== "not_found")
      return mapRepositoryError(formal.error);
    const currentFormal = formal.ok ? formal.value : null;
    if (!sameVersion(input.expectedFormal, currentFormal?.version ?? null)) {
      return failure(
        "conflict",
        "The formal stage artifact changed externally; refusing overwrite.",
        [],
        input.expectedFormal,
        currentFormal?.version ?? null,
      );
    }

    const approvalId = await this.nextApprovalId();
    const now = this.now();
    let formalVersion: FileVersion | null = currentFormal?.version ?? null;
    if (input.decision === "approved") {
      const formalDocument: GovernanceDocument = {
        frontMatter: {
          ...(currentFormal?.document.frontMatter ?? {}),
          schema_version: 1,
          document_type: "stage_artifact",
          artifact_status: "approved",
          stage: input.stage,
          stage_run_id: input.stageRunId,
          revision: nextRevision(currentFormal),
          created_at: createdAt(currentFormal, now),
          updated_at: now,
          payload: candidate.value.payload,
          approval_id: approvalId,
          approved_by: "user",
          approved_at: now,
        },
        body: candidate.value.body,
      };
      const writtenFormal = await this.repository.write(
        formalPath,
        formalDocument,
        input.expectedFormal,
      );
      if (!writtenFormal.ok) return mapRepositoryError(writtenFormal.error);
      formalVersion = writtenFormal.value.version;
    }

    const approvalDocument: GovernanceDocument = {
      frontMatter: {
        schema_version: 1,
        document_type: "stage_approval",
        approval_id: approvalId,
        stage: input.stage,
        stage_run_id: input.stageRunId,
        revision: 1,
        created_at: now,
        updated_at: now,
        decision: input.decision,
        decided_by: "user",
        note: input.note.trim(),
        subject_revision: formalVersion?.revision ?? null,
        subject_hash: formalVersion?.hash ?? null,
        candidate_revision: candidate.value.version.revision,
        candidate_hash: candidate.value.version.hash,
        review_revision: review.value.version.revision,
        review_hash: review.value.version.hash,
      },
      body: `# ${approvalId}: ${input.stage} stage decision\n\n- Decision: ${input.decision}\n- Stage run: ${input.stageRunId}\n- Note: ${input.note.trim()}\n`,
    };
    const writtenApproval = await this.repository.write(
      approvalPath(approvalId),
      approvalDocument,
      null,
    );
    if (!writtenApproval.ok) return mapRepositoryError(writtenApproval.error);
    const audited = await this.audit(
      `stage_${input.decision}`,
      "user",
      input.stage,
      input.stageRunId,
      input.decision === "approved" ? "status_changed" : "recovery",
      { approval_id: approvalId, decision: input.decision },
      input.decision === "approved"
        ? {
            from: currentFormal === null ? null : "in_review",
            to: "completed",
            reason: "The stage artifact passed review and user approval.",
          }
        : undefined,
    );
    if (!audited.ok) return audited;
    return {
      ok: true,
      value: {
        approvalId,
        stageRunId: input.stageRunId,
        stage: input.stage,
        decision: input.decision,
        note: input.note.trim(),
        subjectSnapshot: formalVersion,
        relativePath: approvalPath(approvalId),
        version: writtenApproval.value.version,
      },
    };
  }

  public async approve(
    input: Omit<StageArtifactDecisionInput, "decision">,
  ): Promise<StageArtifactServiceResult<StageApprovalRecord>> {
    return this.decide({ ...input, decision: "approved" });
  }

  private async nextApprovalId(): Promise<string> {
    let names: readonly string[] = [];
    try {
      names = await readdir(resolve(this.projectRoot, APPROVAL_DIRECTORY));
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      )) {
        throw error;
      }
    }
    const max = names
      .filter((name) => /^APPROVAL-\d{3}\.md$/.test(name))
      .reduce((value, name) => Math.max(value, Number(name.slice(9, 12))), 0);
    if (max >= 999) throw new Error("No stage approval ID is available.");
    return `APPROVAL-${String(max + 1).padStart(3, "0")}`;
  }

  private async audit(
    action: string,
    actor: AuditEventActor,
    stage: PreflightStage,
    stageRunId: string,
    type: AuditEventType,
    details: Readonly<Record<string, string | number | boolean | null>>,
    statusChange?: AuditStatusChange,
  ): Promise<StageArtifactServiceResult<true>> {
    const repository = new AuditLogRepository(this.projectRoot);
    const current = await repository.readAll();
    if (!current.ok) {
      return failure(
        "audit_failed",
        current.error.message,
        current.error.details,
      );
    }
    const next =
      current.value.reduce(
        (max, event) => Math.max(max, Number(event.id.slice(5))),
        0,
      ) + 1;
    const event = createAuditEvent({
      id: parseFormalId(`EXEC-${String(next).padStart(3, "0")}`) as ExecutionId,
      occurredAt: this.now(),
      type,
      actor,
      action,
      relatedObjectIds: [],
      statusChange: statusChange ?? null,
      details: { stage, stage_run_id: stageRunId, ...details },
    });
    if (!event.ok)
      return failure("audit_failed", event.error.message, event.error.details);
    const appended = await repository.append(event.value);
    return appended.ok
      ? { ok: true, value: true }
      : failure("audit_failed", appended.error.message, appended.error.details);
  }
}
