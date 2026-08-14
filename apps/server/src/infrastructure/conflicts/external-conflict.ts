import type {
  ExecutionId,
  FormalId,
  UtcIsoTimestamp,
} from "@personal-ai-operator/contracts";

import { createAuditEvent, type AuditEvent } from "../audit/audit-event.js";
import {
  AuditLogRepository,
  type AuditLogRepositoryResult,
} from "../audit/audit-log-repository.js";
import type {
  FileVersion,
  GovernanceSnapshot,
} from "../files/governance-repository.js";
import {
  GovernanceRepository,
  type GovernanceRepositoryError,
} from "../files/governance-repository.js";
import type { GovernanceDocument } from "../files/governance-codec.js";
import {
  sharedProjectWriteQueue,
  type ProjectWriteQueue,
} from "../files/project-write-queue.js";

export const conflictChoices = [
  "reload_external",
  "keep_local",
  "cancel",
] as const;

export type ConflictChoice = (typeof conflictChoices)[number];

export type ConflictRecord = Readonly<{
  readonly conflictId: ExecutionId;
  readonly relativePath: string;
  readonly expected: FileVersion | null;
  readonly actual: FileVersion | null;
  readonly pendingDocument: GovernanceDocument;
  readonly relatedObjectIds: readonly FormalId[];
  readonly detectedAt: UtcIsoTimestamp;
  readonly choices: typeof conflictChoices;
}>;

export type ConflictWriteRequest = Readonly<{
  readonly relativePath: string;
  readonly document: GovernanceDocument;
  readonly expected: FileVersion | null;
  readonly conflictId: ExecutionId;
  readonly relatedObjectIds: readonly FormalId[];
  readonly detectedAt: UtcIsoTimestamp;
}>;

export type ConflictResolution = Readonly<{
  readonly choice: ConflictChoice;
  readonly outcome: "external_reloaded" | "local_preserved" | "cancelled";
  readonly externalSnapshot: GovernanceSnapshot | null;
  readonly localDocument: GovernanceDocument | null;
}>;

export type ExternalConflictErrorCode =
  | "invalid_request"
  | "conflict_detected"
  | "external_read_failed"
  | "write_failed"
  | "audit_failed";

export type ExternalConflictError = Readonly<{
  readonly code: ExternalConflictErrorCode;
  readonly message: string;
  readonly details: readonly string[];
  readonly repositoryError?: GovernanceRepositoryError;
}>;

export type ExternalConflictResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: ExternalConflictError }>;

export type AuditLogWriter = Readonly<{
  readonly append: (
    event: AuditEvent,
  ) => Promise<AuditLogRepositoryResult<AuditEvent>>;
}>;

function failure<Value>(
  code: ExternalConflictErrorCode,
  message: string,
  details: readonly string[] = [],
  repositoryError?: GovernanceRepositoryError,
): ExternalConflictResult<Value> {
  const error: ExternalConflictError = { code, message, details };
  return {
    ok: false,
    error:
      repositoryError === undefined ? error : { ...error, repositoryError },
  };
}

function mapRepositoryError<Value>(
  error: GovernanceRepositoryError,
  code: ExternalConflictErrorCode = "write_failed",
): ExternalConflictResult<Value> {
  return failure(code, error.message, error.details, error);
}

export class ExternalConflictCoordinator {
  private readonly repository: GovernanceRepository;
  private readonly auditLog: AuditLogWriter;

  public constructor(
    projectRoot: string,
    writeQueue: ProjectWriteQueue = sharedProjectWriteQueue,
    auditLog: AuditLogWriter = new AuditLogRepository(projectRoot, writeQueue),
  ) {
    this.repository = new GovernanceRepository(projectRoot, writeQueue);
    this.auditLog = auditLog;
  }

  public async write(request: ConflictWriteRequest): Promise<
    ExternalConflictResult<
      | Readonly<{
          readonly kind: "written";
          readonly snapshot: GovernanceSnapshot;
        }>
      | Readonly<{
          readonly kind: "conflict";
          readonly conflict: ConflictRecord;
        }>
    >
  > {
    const written = await this.repository.write(
      request.relativePath,
      request.document,
      request.expected,
    );
    if (written.ok) {
      return { ok: true, value: { kind: "written", snapshot: written.value } };
    }
    if (
      written.error.code !== "revision_mismatch" &&
      written.error.code !== "hash_mismatch"
    ) {
      return mapRepositoryError(written.error);
    }

    const actual = await this.repository.read(request.relativePath);
    if (!actual.ok && actual.error.code !== "not_found") {
      return mapRepositoryError(actual.error, "external_read_failed");
    }
    const conflict: ConflictRecord = {
      conflictId: request.conflictId,
      relativePath: request.relativePath,
      expected: request.expected,
      actual: actual.ok ? actual.value.version : null,
      pendingDocument: request.document,
      relatedObjectIds: [...request.relatedObjectIds],
      detectedAt: request.detectedAt,
      choices: conflictChoices,
    };
    return { ok: true, value: { kind: "conflict", conflict } };
  }

  public async resolve(
    conflict: ConflictRecord,
    choice: ConflictChoice,
    decidedAt: UtcIsoTimestamp,
  ): Promise<ExternalConflictResult<ConflictResolution>> {
    const current = await this.repository.read(conflict.relativePath);
    const externalSnapshot = current.ok ? current.value : null;
    if (!current.ok && current.error.code !== "not_found") {
      return mapRepositoryError(current.error, "external_read_failed");
    }

    const outcome =
      choice === "reload_external"
        ? "external_reloaded"
        : choice === "keep_local"
          ? "local_preserved"
          : "cancelled";
    const resolution: ConflictResolution = {
      choice,
      outcome,
      externalSnapshot: choice === "reload_external" ? externalSnapshot : null,
      localDocument: choice === "keep_local" ? conflict.pendingDocument : null,
    };
    const event = createAuditEvent({
      id: conflict.conflictId,
      occurredAt: decidedAt,
      type: "recovery",
      actor: "user",
      action: "external conflict resolved",
      relatedObjectIds: conflict.relatedObjectIds,
      executionId: conflict.conflictId,
      details: {
        relative_path: conflict.relativePath,
        choice,
        outcome,
        expected_revision: conflict.expected?.revision ?? 0,
        actual_revision: conflict.actual?.revision ?? 0,
        actual_present: externalSnapshot !== null,
      },
    });
    if (!event.ok) {
      return failure("audit_failed", event.error.message, event.error.details);
    }
    const recorded = await this.auditLog.append(event.value);
    if (!recorded.ok) {
      return failure(
        "audit_failed",
        recorded.error.message,
        recorded.error.details,
      );
    }
    return { ok: true, value: resolution };
  }
}
