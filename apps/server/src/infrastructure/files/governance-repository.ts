import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  decodeGovernanceDocument,
  encodeGovernanceDocument,
  type GovernanceCodecError,
  type GovernanceDocument,
} from "./governance-codec.js";
import { writeFileAtomically } from "./atomic-file-writer.js";
import { sha256Content } from "./content-hash.js";
import {
  sharedProjectWriteQueue,
  type ProjectWriteQueue,
} from "./project-write-queue.js";

export type FileVersion = Readonly<{
  readonly revision: number;
  readonly hash: string;
}>;

export type GovernanceSnapshot = Readonly<{
  readonly relativePath: string;
  readonly document: GovernanceDocument;
  readonly version: FileVersion;
}>;

export type GovernanceRepositoryErrorCode =
  | "invalid_path"
  | "not_found"
  | "invalid_document"
  | "revision_mismatch"
  | "hash_mismatch"
  | "write_failed";

export type GovernanceRepositoryError = Readonly<{
  readonly code: GovernanceRepositoryErrorCode;
  readonly message: string;
  readonly details: readonly string[];
  readonly expected?: FileVersion | null;
  readonly actual?: FileVersion | null;
}>;

export type GovernanceRepositoryResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: GovernanceRepositoryError }>;

type RawFile = Readonly<{
  readonly bytes: Uint8Array;
  readonly snapshot: GovernanceSnapshot;
}>;

function failure<Value>(
  code: GovernanceRepositoryErrorCode,
  message: string,
  details: readonly string[] = [],
  expected?: FileVersion | null,
  actual?: FileVersion | null,
): GovernanceRepositoryResult<Value> {
  let error: GovernanceRepositoryError = { code, message, details };
  if (expected !== undefined) {
    error = { ...error, expected };
  }
  if (actual !== undefined) {
    error = { ...error, actual };
  }
  return {
    ok: false,
    error,
  };
}

function mapCodecError<Value>(
  error: GovernanceCodecError,
): GovernanceRepositoryResult<Value> {
  return failure("invalid_document", error.message, [
    error.code,
    ...error.details,
  ]);
}

function parseRevision(document: GovernanceDocument): number | undefined {
  const revision = document.frontMatter.revision;
  return typeof revision === "number" &&
    Number.isInteger(revision) &&
    revision > 0
    ? revision
    : undefined;
}

export class GovernanceRepository {
  private readonly projectRoot: string;
  private readonly writeQueue: ProjectWriteQueue;

  public constructor(
    projectRoot: string,
    writeQueue: ProjectWriteQueue = sharedProjectWriteQueue,
  ) {
    this.projectRoot = resolve(projectRoot);
    this.writeQueue = writeQueue;
  }

  public async read(
    relativePath: string,
  ): Promise<GovernanceRepositoryResult<GovernanceSnapshot>> {
    const filePath = this.resolvePath(relativePath);
    if (!filePath.ok) {
      return filePath;
    }

    const raw = await this.readRaw(relativePath, filePath.value);
    if (!raw.ok) {
      return raw;
    }
    return { ok: true, value: raw.value.snapshot };
  }

  public async write(
    relativePath: string,
    document: GovernanceDocument,
    expected: FileVersion | null,
  ): Promise<GovernanceRepositoryResult<GovernanceSnapshot>> {
    const filePath = this.resolvePath(relativePath);
    if (!filePath.ok) {
      return filePath;
    }

    return this.writeQueue.enqueue(this.projectRoot, async () => {
      const current = await this.readRaw(relativePath, filePath.value);
      if (!current.ok && current.error.code !== "not_found") {
        return current;
      }

      const actual = current.ok ? current.value.snapshot.version : null;
      if (expected === null && actual !== null) {
        return failure(
          "revision_mismatch",
          "The file appeared after the caller read the project; refusing overwrite.",
          [],
          expected,
          actual,
        );
      }
      if (expected !== null && actual === null) {
        return failure(
          "revision_mismatch",
          "The expected file is missing; refusing overwrite.",
          [],
          expected,
          actual,
        );
      }
      if (
        expected !== null &&
        actual !== null &&
        expected.revision !== actual.revision
      ) {
        return failure(
          "revision_mismatch",
          "The file revision changed; refusing overwrite.",
          [],
          expected,
          actual,
        );
      }
      if (
        expected !== null &&
        actual !== null &&
        expected.hash !== actual.hash
      ) {
        return failure(
          "hash_mismatch",
          "The file content changed externally; refusing overwrite.",
          [],
          expected,
          actual,
        );
      }

      const nextRevision = parseRevision(document);
      const expectedRevision = actual === null ? 1 : actual.revision + 1;
      if (nextRevision !== expectedRevision) {
        return failure(
          "revision_mismatch",
          `Next revision must be ${expectedRevision}.`,
          [],
          { revision: expectedRevision, hash: actual?.hash ?? "" },
          nextRevision === undefined
            ? null
            : { revision: nextRevision, hash: "" },
        );
      }

      const encoded = encodeGovernanceDocument(document);
      if (!encoded.ok) {
        return failure(
          "invalid_document",
          encoded.error.message,
          encoded.error.details,
        );
      }
      const bytes = new TextEncoder().encode(encoded.value);
      const written = await writeFileAtomically(filePath.value, bytes);
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
          relativePath,
          document,
          version: { revision: nextRevision, hash: sha256Content(bytes) },
        },
      };
    });
  }

  private resolvePath(
    relativePath: string,
  ): GovernanceRepositoryResult<string> {
    if (isAbsolute(relativePath)) {
      return failure(
        "invalid_path",
        "Repository paths must be relative to the project root.",
      );
    }
    const candidate = resolve(this.projectRoot, relativePath);
    const outside = relative(this.projectRoot, candidate);
    if (
      outside === "" ||
      outside === ".." ||
      outside.startsWith(`..${sep}`) ||
      outside.startsWith("../")
    ) {
      return failure(
        "invalid_path",
        "Repository path must remain inside the project root.",
      );
    }
    return { ok: true, value: candidate };
  }

  private async readRaw(
    relativePath: string,
    filePath: string,
  ): Promise<GovernanceRepositoryResult<RawFile>> {
    let bytes: Uint8Array;
    try {
      bytes = await readFile(filePath);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return failure(
          "not_found",
          `Governance file not found: ${relativePath}.`,
        );
      }
      return failure("invalid_document", "Governance file could not be read.", [
        error instanceof Error ? error.message : String(error),
      ]);
    }

    const decoded = decodeGovernanceDocument(bytes);
    if (!decoded.ok) {
      return mapCodecError(decoded.error);
    }
    const revision = parseRevision(decoded.value);
    if (revision === undefined) {
      return failure(
        "invalid_document",
        "Governance front matter must contain a positive integer revision.",
      );
    }

    return {
      ok: true,
      value: {
        bytes,
        snapshot: {
          relativePath,
          document: decoded.value,
          version: { revision, hash: sha256Content(bytes) },
        },
      },
    };
  }
}
