import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  decodeAuditLog,
  encodeAuditEvent,
  type AuditLogCodecError,
} from "./audit-log-codec.js";
import type { AuditEvent } from "./audit-event.js";
import {
  sharedProjectWriteQueue,
  type ProjectWriteQueue,
} from "../files/project-write-queue.js";

export const auditLogRelativePath = ".personal-workspace/audit/events.jsonl";

export type AuditLogRepositoryErrorCode =
  | "invalid_event"
  | "invalid_log"
  | "duplicate_event"
  | "read_failed"
  | "write_failed";

export type AuditLogRepositoryError = Readonly<{
  readonly code: AuditLogRepositoryErrorCode;
  readonly message: string;
  readonly details: readonly string[];
  readonly codecError?: AuditLogCodecError;
}>;

export type AuditLogRepositoryResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: AuditLogRepositoryError }>;

function failure<Value>(
  code: AuditLogRepositoryErrorCode,
  message: string,
  details: readonly string[] = [],
  codecError?: AuditLogCodecError,
): AuditLogRepositoryResult<Value> {
  const error: AuditLogRepositoryError = { code, message, details };
  return {
    ok: false,
    error: codecError === undefined ? error : { ...error, codecError },
  };
}

function mapCodecError<Value>(
  error: AuditLogCodecError,
): AuditLogRepositoryResult<Value> {
  return failure("invalid_log", error.message, error.details, error);
}

export class AuditLogRepository {
  private readonly projectRoot: string;
  private readonly logPath: string;
  private readonly writeQueue: ProjectWriteQueue;

  public constructor(
    projectRoot: string,
    writeQueue: ProjectWriteQueue = sharedProjectWriteQueue,
  ) {
    this.projectRoot = resolve(projectRoot);
    this.logPath = resolve(this.projectRoot, auditLogRelativePath);
    this.writeQueue = writeQueue;
  }

  public async readAll(): Promise<
    AuditLogRepositoryResult<readonly AuditEvent[]>
  > {
    let content: Uint8Array;
    try {
      content = await readFile(this.logPath);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return { ok: true, value: [] };
      }
      return failure("read_failed", "Audit log could not be read.", [
        error instanceof Error ? error.message : String(error),
      ]);
    }

    const decoded = decodeAuditLog(content);
    if (!decoded.ok) {
      return mapCodecError(decoded.error);
    }
    return { ok: true, value: decoded.value };
  }

  public async append(
    event: AuditEvent,
  ): Promise<AuditLogRepositoryResult<AuditEvent>> {
    return this.writeQueue.enqueue(this.projectRoot, async () => {
      const encoded = encodeAuditEvent(event);
      if (!encoded.ok) {
        return failure(
          "invalid_event",
          encoded.error.message,
          encoded.error.details,
        );
      }

      const current = await this.readAll();
      if (!current.ok) {
        return current;
      }
      if (current.value.some((existing) => existing.id === event.id)) {
        return failure(
          "duplicate_event",
          `Audit event ${event.id} already exists; existing events are immutable.`,
        );
      }

      try {
        await mkdir(dirname(this.logPath), { recursive: true });
        await appendFile(this.logPath, encoded.value, { encoding: "utf8" });
      } catch (error) {
        return failure("write_failed", "Audit event could not be appended.", [
          error instanceof Error ? error.message : String(error),
        ]);
      }

      return { ok: true, value: event };
    });
  }
}
