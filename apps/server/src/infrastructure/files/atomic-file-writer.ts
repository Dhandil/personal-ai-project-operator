import { randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname, basename, join } from "node:path";
import type { FileHandle } from "node:fs/promises";

const RENAME_RETRY_DELAYS_MS = [5, 10, 20, 40, 80, 160, 320, 640];

export type AtomicWriteError = Readonly<{
  readonly code: "atomic_write_failed";
  readonly message: string;
  readonly details: readonly string[];
}>;

export type AtomicWriteResult =
  | Readonly<{ readonly ok: true }>
  | Readonly<{ readonly ok: false; readonly error: AtomicWriteError }>;

function failure(error: unknown): AtomicWriteResult {
  return {
    ok: false,
    error: {
      code: "atomic_write_failed",
      message: "Atomic file write failed; the target file was not replaced.",
      details: [error instanceof Error ? error.message : String(error)],
    },
  };
}

function isRetryableRenameError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  return (
    error.code === "EPERM" || error.code === "EBUSY" || error.code === "EACCES"
  );
}

async function renameWithRetry(
  temporaryPath: string,
  filePath: string,
): Promise<void> {
  for (const delay of [0, ...RENAME_RETRY_DELAYS_MS]) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      await rename(temporaryPath, filePath);
      return;
    } catch (error) {
      if (
        !isRetryableRenameError(error) ||
        delay === RENAME_RETRY_DELAYS_MS.at(-1)
      ) {
        throw error;
      }
    }
  }
}

export async function writeFileAtomically(
  filePath: string,
  content: string | Uint8Array,
): Promise<AtomicWriteResult> {
  const directory = dirname(filePath);
  const temporaryPath = join(
    directory,
    `.${basename(filePath)}.${randomUUID()}.tmp`,
  );
  let handle: FileHandle | undefined;

  try {
    await mkdir(directory, { recursive: true });
    handle = await open(temporaryPath, "wx");
    await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await renameWithRetry(temporaryPath, filePath);
    return { ok: true };
  } catch (error) {
    return failure(error);
  } finally {
    if (handle !== undefined) {
      await handle.close().catch(() => undefined);
    }
    await unlink(temporaryPath).catch(() => undefined);
  }
}
