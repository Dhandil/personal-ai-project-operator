import { mkdir, readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import type { UtcIsoTimestamp } from "@personal-ai-operator/contracts";

import { writeFileAtomically } from "../files/atomic-file-writer.js";
import { sha256Content } from "../files/content-hash.js";
import {
  defaultDatabasePath,
  defaultRegistryDirectory,
  RegistryDatabase,
  type RegistryDatabaseError,
} from "./registry-database.js";

type RegistrationMarker = Readonly<{
  readonly schema_version: 1;
  readonly project_key: string;
  readonly root_path: string;
  readonly name: string;
  readonly registered_at: UtcIsoTimestamp;
}>;

export type ProjectRegistrationInput = Readonly<{
  readonly rootPath: string;
  readonly name: string;
  readonly registeredAt: UtcIsoTimestamp;
}>;

export type ProjectIndexRecord = Readonly<{
  readonly projectKey: string;
  readonly rootPath: string;
  readonly name: string;
  readonly registeredAt: UtcIsoTimestamp;
  readonly lastSeenAt: UtcIsoTimestamp;
  readonly archived: boolean;
}>;

export type ProjectCache = Readonly<{
  readonly snapshotHash: string;
  readonly snapshotRevision: number;
  readonly refreshedAt: UtcIsoTimestamp;
}>;

export type ProjectRegistryErrorCode =
  | "invalid_registration"
  | "invalid_marker"
  | "database_failed"
  | "registry_failed";

export type ProjectRegistryError = Readonly<{
  readonly code: ProjectRegistryErrorCode;
  readonly message: string;
  readonly details: readonly string[];
  readonly databaseError?: RegistryDatabaseError;
}>;

export type ProjectRegistryResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: ProjectRegistryError }>;

export type ProjectRegistryOptions = Readonly<{
  readonly databasePath?: string;
  readonly registryDirectory?: string;
}>;

function failure<Value>(
  code: ProjectRegistryErrorCode,
  message: string,
  details: readonly string[] = [],
  databaseError?: RegistryDatabaseError,
): ProjectRegistryResult<Value> {
  const error: ProjectRegistryError = { code, message, details };
  return {
    ok: false,
    error: databaseError === undefined ? error : { ...error, databaseError },
  };
}

function isRegistrationMarker(value: unknown): value is RegistrationMarker {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const marker = value as Record<string, unknown>;
  return (
    marker.schema_version === 1 &&
    typeof marker.project_key === "string" &&
    marker.project_key.length === 64 &&
    typeof marker.root_path === "string" &&
    isAbsolute(marker.root_path) &&
    typeof marker.name === "string" &&
    marker.name.trim().length > 0 &&
    typeof marker.registered_at === "string" &&
    marker.registered_at.endsWith("Z")
  );
}

function projectKey(rootPath: string): string {
  return sha256Content(resolve(rootPath));
}

function markerToRecord(marker: RegistrationMarker): ProjectIndexRecord {
  return {
    projectKey: marker.project_key,
    rootPath: marker.root_path,
    name: marker.name,
    registeredAt: marker.registered_at,
    lastSeenAt: marker.registered_at,
    archived: false,
  };
}

export class ProjectRegistryRepository {
  private readonly database: RegistryDatabase;
  private readonly registryDirectory: string;

  public constructor(options: ProjectRegistryOptions = {}) {
    this.database = new RegistryDatabase(
      options.databasePath ?? defaultDatabasePath(),
    );
    this.registryDirectory = resolve(
      options.registryDirectory ?? defaultRegistryDirectory(),
    );
    const migrated = this.database.migrate();
    if (!migrated.ok) {
      throw new Error(
        `${migrated.error.message} ${migrated.error.details.join(" ")}`,
      );
    }
  }

  public async register(
    input: ProjectRegistrationInput,
  ): Promise<ProjectRegistryResult<ProjectIndexRecord>> {
    const rootPath = resolve(input.rootPath);
    if (
      input.name.trim().length === 0 ||
      input.registeredAt.endsWith("Z") === false ||
      rootPath.length === 0
    ) {
      return failure(
        "invalid_registration",
        "A project registration requires a name, root path, and UTC timestamp.",
      );
    }
    const marker: RegistrationMarker = {
      schema_version: 1,
      project_key: projectKey(rootPath),
      root_path: rootPath,
      name: input.name.trim(),
      registered_at: input.registeredAt,
    };
    const markerPath = join(
      this.registryDirectory,
      `${marker.project_key}.json`,
    );
    try {
      const encoded = `${JSON.stringify(marker, null, 2)}\n`;
      const written = await writeFileAtomically(markerPath, encoded);
      if (!written.ok) {
        return failure(
          "registry_failed",
          written.error.message,
          written.error.details,
        );
      }
      const saved = this.upsertRecord(markerToRecord(marker));
      return saved;
    } catch (error) {
      return failure("registry_failed", "Project registration failed.", [
        error instanceof Error ? error.message : String(error),
      ]);
    }
  }

  public list(): ProjectRegistryResult<readonly ProjectIndexRecord[]> {
    try {
      const rows = this.database
        .prepare(
          "SELECT project_key, root_path, name, registered_at, last_seen_at, archived FROM projects ORDER BY name, root_path",
        )
        .all() as readonly Record<string, unknown>[];
      return {
        ok: true,
        value: rows.map((row) => ({
          projectKey: String(row.project_key),
          rootPath: String(row.root_path),
          name: String(row.name),
          registeredAt: String(row.registered_at) as UtcIsoTimestamp,
          lastSeenAt: String(row.last_seen_at) as UtcIsoTimestamp,
          archived: Number(row.archived) === 1,
        })),
      };
    } catch (error) {
      return failure("database_failed", "Project index could not be read.", [
        error instanceof Error ? error.message : String(error),
      ]);
    }
  }

  public async rebuildFromRegistry(): Promise<
    ProjectRegistryResult<readonly ProjectIndexRecord[]>
  > {
    let entries: string[];
    try {
      await mkdir(this.registryDirectory, { recursive: true });
      entries = (await readdir(this.registryDirectory)).filter((entry) =>
        entry.endsWith(".json"),
      );
    } catch (error) {
      return failure(
        "registry_failed",
        "Registration directory could not be read.",
        [error instanceof Error ? error.message : String(error)],
      );
    }

    const records: ProjectIndexRecord[] = [];
    for (const entry of entries.toSorted()) {
      try {
        const parsed = JSON.parse(
          await readFile(join(this.registryDirectory, entry), "utf8"),
        ) as unknown;
        if (!isRegistrationMarker(parsed)) {
          return failure(
            "invalid_marker",
            `Invalid registration marker: ${entry}.`,
          );
        }
        if (projectKey(parsed.root_path) !== parsed.project_key) {
          return failure(
            "invalid_marker",
            `Registration marker key mismatch: ${entry}.`,
          );
        }
        records.push(markerToRecord(parsed));
      } catch (error) {
        return failure(
          "invalid_marker",
          `Registration marker could not be read: ${entry}.`,
          [error instanceof Error ? error.message : String(error)],
        );
      }
    }

    try {
      this.database.transaction(() => {
        this.database.exec("DELETE FROM project_cache; DELETE FROM projects;");
        for (const record of records) {
          this.insertRecord(record);
        }
      });
      return {
        ok: true,
        value: records.toSorted((left, right) =>
          left.name.localeCompare(right.name),
        ),
      };
    } catch (error) {
      return failure("database_failed", "Project index rebuild failed.", [
        error instanceof Error ? error.message : String(error),
      ]);
    }
  }

  public setSetting(key: string, value: string): ProjectRegistryResult<null> {
    if (key.trim().length === 0) {
      return failure("invalid_registration", "Setting key cannot be empty.");
    }
    try {
      this.database
        .prepare(
          "INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .run(key.trim(), value);
      return { ok: true, value: null };
    } catch (error) {
      return failure("database_failed", "Setting could not be saved.", [
        error instanceof Error ? error.message : String(error),
      ]);
    }
  }

  public getSetting(key: string): ProjectRegistryResult<string | null> {
    try {
      const row = this.database
        .prepare("SELECT value FROM settings WHERE key = ?")
        .get(key) as { value?: string } | undefined;
      return { ok: true, value: row?.value ?? null };
    } catch (error) {
      return failure("database_failed", "Setting could not be read.", [
        error instanceof Error ? error.message : String(error),
      ]);
    }
  }

  public setCache(
    projectKeyValue: string,
    cacheKey: string,
    cache: ProjectCache,
  ): ProjectRegistryResult<null> {
    try {
      this.database
        .prepare(
          "INSERT INTO project_cache(project_key, cache_key, value, refreshed_at) VALUES (?, ?, ?, ?) ON CONFLICT(project_key, cache_key) DO UPDATE SET value = excluded.value, refreshed_at = excluded.refreshed_at",
        )
        .run(
          projectKeyValue,
          cacheKey,
          JSON.stringify(cache),
          cache.refreshedAt,
        );
      return { ok: true, value: null };
    } catch (error) {
      return failure("database_failed", "Project cache could not be saved.", [
        error instanceof Error ? error.message : String(error),
      ]);
    }
  }

  public close(): void {
    this.database.close();
  }

  public databasePath(): string {
    return this.database.databasePath();
  }

  private upsertRecord(
    record: ProjectIndexRecord,
  ): ProjectRegistryResult<ProjectIndexRecord> {
    try {
      this.insertRecord(record);
      return { ok: true, value: record };
    } catch (error) {
      return failure("database_failed", "Project index could not be saved.", [
        error instanceof Error ? error.message : String(error),
      ]);
    }
  }

  private insertRecord(record: ProjectIndexRecord): void {
    this.database
      .prepare(
        "INSERT INTO projects(project_key, root_path, name, registered_at, last_seen_at, archived) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(project_key) DO UPDATE SET root_path = excluded.root_path, name = excluded.name, last_seen_at = excluded.last_seen_at, archived = excluded.archived",
      )
      .run(
        record.projectKey,
        record.rootPath,
        record.name,
        record.registeredAt,
        record.lastSeenAt,
        record.archived ? 1 : 0,
      );
  }
}
