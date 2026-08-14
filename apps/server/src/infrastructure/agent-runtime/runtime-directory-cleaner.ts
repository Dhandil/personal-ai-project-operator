import { lstat, readdir, rm } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

export type RuntimeDirectoryCleanupResult =
  | Readonly<{
      readonly ok: true;
      readonly directory: string;
      readonly estimatedFreedBytes: number;
    }>
  | Readonly<{
      readonly ok: false;
      readonly code: "path_violation" | "cleanup_failed";
      readonly directory: string;
      readonly message: string;
      readonly estimatedFreedBytes: number;
    }>;

export type RuntimeDirectoryCleanerOptions = Readonly<{
  readonly runtimeRoot: string;
}>;

function isWithinRoot(runtimeRoot: string, directory: string): boolean {
  const child = relative(runtimeRoot, directory);
  return child.length > 0 && !child.startsWith("..") && !isAbsolute(child);
}

async function sizeOf(path: string): Promise<number> {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) return info.size;
  const entries = await readdir(path, { withFileTypes: true });
  let total = 0;
  for (const entry of entries) {
    total += await sizeOf(resolve(path, entry.name));
  }
  return total;
}

export class RuntimeDirectoryCleaner {
  private readonly runtimeRoot: string;

  public constructor(options: RuntimeDirectoryCleanerOptions) {
    if (!isAbsolute(options.runtimeRoot)) {
      throw new Error("The application runtime root must be absolute.");
    }
    this.runtimeRoot = resolve(options.runtimeRoot);
  }

  public validate(directory: string): string | null {
    if (!isAbsolute(directory)) {
      return "Runtime cleanup target must be an absolute path.";
    }
    const target = resolve(directory);
    if (!isWithinRoot(this.runtimeRoot, target)) {
      return "Runtime cleanup target must remain inside the application runtime root.";
    }
    return null;
  }

  public async cleanup(
    directory: string,
  ): Promise<RuntimeDirectoryCleanupResult> {
    const validationError = this.validate(directory);
    if (validationError !== null) {
      return {
        ok: false,
        code: "path_violation",
        directory,
        message: validationError,
        estimatedFreedBytes: 0,
      };
    }
    const target = resolve(directory);
    let estimatedFreedBytes = 0;
    try {
      try {
        estimatedFreedBytes = await sizeOf(target);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") throw error;
      }
      await rm(target, { recursive: true, force: true });
      return { ok: true, directory: target, estimatedFreedBytes };
    } catch (error) {
      return {
        ok: false,
        code: "cleanup_failed",
        directory: target,
        message: error instanceof Error ? error.message : String(error),
        estimatedFreedBytes,
      };
    }
  }
}
