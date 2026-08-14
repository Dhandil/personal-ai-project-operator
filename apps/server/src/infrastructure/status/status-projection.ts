import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { UtcIsoTimestamp } from "@personal-ai-operator/contracts";

import {
  decodeGovernanceDocument,
  encodeGovernanceDocument,
  type GovernanceCodecError,
  type GovernanceDocument,
} from "../files/governance-codec.js";
import { writeFileAtomically } from "../files/atomic-file-writer.js";
import { sha256Content } from "../files/content-hash.js";
import {
  sharedProjectWriteQueue,
  type ProjectWriteQueue,
} from "../files/project-write-queue.js";
import {
  renderStatusDocument,
  type StatusProjectionFacts,
} from "./status-renderer.js";

export const statusRelativePath = ".personal-workspace/status.md";

export type StatusSnapshot = Readonly<{
  readonly relativePath: typeof statusRelativePath;
  readonly document: GovernanceDocument;
  readonly revision: number;
  readonly hash: string;
}>;

export type StatusProjectionErrorCode =
  "not_found" | "invalid_status" | "write_failed";

export type StatusProjectionError = Readonly<{
  readonly code: StatusProjectionErrorCode;
  readonly message: string;
  readonly details: readonly string[];
  readonly codecError?: GovernanceCodecError;
}>;

export type StatusProjectionResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: StatusProjectionError }>;

export type StatusSnapshotReader = Readonly<{
  readonly read: () => Promise<StatusProjectionResult<StatusSnapshot>>;
}>;

function failure<Value>(
  code: StatusProjectionErrorCode,
  message: string,
  details: readonly string[] = [],
  codecError?: GovernanceCodecError,
): StatusProjectionResult<Value> {
  const error: StatusProjectionError = { code, message, details };
  return {
    ok: false,
    error: codecError === undefined ? error : { ...error, codecError },
  };
}

function parseRevision(document: GovernanceDocument): number | undefined {
  const revision = document.frontMatter.revision;
  return typeof revision === "number" &&
    Number.isInteger(revision) &&
    revision > 0
    ? revision
    : undefined;
}

function mapCodecError<Value>(
  error: GovernanceCodecError,
): StatusProjectionResult<Value> {
  return failure("invalid_status", error.message, error.details, error);
}

export class StatusProjection implements StatusSnapshotReader {
  private readonly projectRoot: string;
  private readonly statusPath: string;
  private readonly writeQueue: ProjectWriteQueue;

  public constructor(
    projectRoot: string,
    writeQueue: ProjectWriteQueue = sharedProjectWriteQueue,
  ) {
    this.projectRoot = resolve(projectRoot);
    this.statusPath = resolve(this.projectRoot, statusRelativePath);
    this.writeQueue = writeQueue;
  }

  public async read(): Promise<StatusProjectionResult<StatusSnapshot>> {
    let bytes: Uint8Array;
    try {
      bytes = await readFile(this.statusPath);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return failure(
          "not_found",
          "The generated status snapshot does not exist.",
        );
      }
      return failure(
        "invalid_status",
        "The generated status snapshot could not be read.",
        [error instanceof Error ? error.message : String(error)],
      );
    }

    const decoded = decodeGovernanceDocument(bytes);
    if (!decoded.ok) {
      return mapCodecError(decoded.error);
    }
    const revision = parseRevision(decoded.value);
    if (
      revision === undefined ||
      decoded.value.frontMatter.document_type !== "status_snapshot"
    ) {
      return failure(
        "invalid_status",
        "The generated status snapshot has invalid metadata.",
      );
    }
    return {
      ok: true,
      value: {
        relativePath: statusRelativePath,
        document: decoded.value,
        revision,
        hash: sha256Content(bytes),
      },
    };
  }

  public async rebuild(
    facts: StatusProjectionFacts,
    generatedAt: UtcIsoTimestamp,
  ): Promise<StatusProjectionResult<StatusSnapshot>> {
    return this.writeQueue.enqueue(this.projectRoot, async () => {
      const currentRevision = await this.readRevisionForRebuild();
      const revision = currentRevision + 1;
      const document = renderStatusDocument(facts, generatedAt, revision);
      const encoded = encodeGovernanceDocument(document);
      if (!encoded.ok) {
        return mapCodecError(encoded.error);
      }
      const bytes = new TextEncoder().encode(encoded.value);
      const written = await writeFileAtomically(this.statusPath, bytes);
      if (!written.ok) {
        return failure(
          "write_failed",
          written.error.message,
          written.error.details,
        );
      }
      return {
        ok: true,
        value: {
          relativePath: statusRelativePath,
          document,
          revision,
          hash: sha256Content(bytes),
        },
      };
    });
  }

  private async readRevisionForRebuild(): Promise<number> {
    const current = await this.read();
    return current.ok ? current.value.revision : 0;
  }
}
