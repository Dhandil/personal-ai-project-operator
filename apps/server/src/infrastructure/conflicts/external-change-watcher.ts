import { existsSync } from "node:fs";
import { watch, type FSWatcher } from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";

import type { UtcIsoTimestamp } from "@personal-ai-operator/contracts";

export type ExternalChangeKind = "created" | "changed" | "deleted";

export type ExternalChange = Readonly<{
  readonly relativePath: string;
  readonly kind: ExternalChangeKind;
  readonly observedAt: UtcIsoTimestamp;
}>;

export type ExternalChangeListener = (change: ExternalChange) => void;

export type ExternalWatchError = Readonly<{
  readonly code: "invalid_path" | "watch_failed";
  readonly message: string;
  readonly details: readonly string[];
}>;

export type ExternalWatchStartResult =
  | Readonly<{
      readonly ok: true;
      readonly value: ExternalWatchHandle;
    }>
  | Readonly<{
      readonly ok: false;
      readonly error: ExternalWatchError;
    }>;

export type ExternalWatchHandle = Readonly<{
  readonly close: () => void;
}>;

function failure(
  code: ExternalWatchError["code"],
  message: string,
  details: readonly string[] = [],
): ExternalWatchStartResult {
  return { ok: false, error: { code, message, details } };
}

function now(): UtcIsoTimestamp {
  return new Date().toISOString() as UtcIsoTimestamp;
}

export class FileSystemChangeWatcher {
  private readonly projectRoot: string;

  public constructor(projectRoot: string) {
    this.projectRoot = resolve(projectRoot);
  }

  public watch(
    relativePaths: readonly string[],
    listener: ExternalChangeListener,
  ): ExternalWatchStartResult {
    const paths = new Map<string, string>();
    for (const relativePath of relativePaths) {
      const absolutePath = this.resolvePath(relativePath);
      if (!absolutePath.ok) {
        return absolutePath;
      }
      paths.set(absolutePath.value, relativePath);
    }

    const pathsByDirectory = new Map<string, Map<string, string>>();
    for (const [absolutePath, relativePath] of paths) {
      const directory = dirname(absolutePath);
      const names =
        pathsByDirectory.get(directory) ?? new Map<string, string>();
      names.set(basename(absolutePath), relativePath);
      pathsByDirectory.set(directory, names);
    }

    const watchers: FSWatcher[] = [];
    try {
      for (const [directory, names] of pathsByDirectory) {
        const watcher = watch(directory, (eventType, filename) => {
          if (filename === null) {
            return;
          }
          const fileName = filename.toString();
          const relativePath = names.get(fileName);
          if (relativePath === undefined) {
            return;
          }
          const absolutePath = resolve(directory, fileName);
          const kind: ExternalChangeKind =
            eventType === "rename"
              ? existsSync(absolutePath)
                ? "created"
                : "deleted"
              : "changed";
          listener({ relativePath, kind, observedAt: now() });
        });
        watchers.push(watcher);
      }
    } catch (error) {
      for (const watcher of watchers) {
        watcher.close();
      }
      return failure("watch_failed", "Could not watch governance files.", [
        error instanceof Error ? error.message : String(error),
      ]);
    }

    let closed = false;
    return {
      ok: true,
      value: {
        close: () => {
          if (closed) {
            return;
          }
          closed = true;
          for (const watcher of watchers) {
            watcher.close();
          }
        },
      },
    };
  }

  private resolvePath(
    relativePath: string,
  ):
    | Readonly<{ readonly ok: true; readonly value: string }>
    | Readonly<{ readonly ok: false; readonly error: ExternalWatchError }> {
    if (relativePath.length === 0 || isAbsolute(relativePath)) {
      return {
        ok: false,
        error: {
          code: "invalid_path",
          message: "Watched paths must be non-empty and relative.",
          details: [relativePath],
        },
      };
    }
    const candidate = resolve(this.projectRoot, relativePath);
    const outside = relative(this.projectRoot, candidate);
    if (
      outside === "" ||
      outside === ".." ||
      outside.startsWith(`..${sep}`) ||
      outside.startsWith("../")
    ) {
      return {
        ok: false,
        error: {
          code: "invalid_path",
          message: "Watched paths must remain inside the project root.",
          details: [relativePath],
        },
      };
    }
    return { ok: true, value: candidate };
  }
}
