import { mkdirSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { dirname, join, resolve } from "node:path";

import { homedir } from "node:os";

const INITIAL_MIGRATION = `
CREATE TABLE projects (
  project_key TEXT PRIMARY KEY,
  root_path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  registered_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
);

CREATE INDEX projects_last_seen_idx ON projects(last_seen_at DESC);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE project_cache (
  project_key TEXT NOT NULL REFERENCES projects(project_key) ON DELETE CASCADE,
  cache_key TEXT NOT NULL,
  value TEXT NOT NULL,
  refreshed_at TEXT NOT NULL,
  PRIMARY KEY (project_key, cache_key)
);
`;

export const initialMigrationVersion = 1;

export type RegistryDatabaseError = Readonly<{
  readonly code: "migration_failed" | "database_failed";
  readonly message: string;
  readonly details: readonly string[];
}>;

export type RegistryDatabaseResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: RegistryDatabaseError }>;

export function defaultAppDataDirectory(): string {
  const localAppData = process.env.LOCALAPPDATA;
  return resolve(
    localAppData ?? join(homedir(), "AppData", "Local"),
    "PersonalAIProjectOperator",
  );
}

export function defaultDatabasePath(): string {
  return join(defaultAppDataDirectory(), "app.db");
}

export function defaultRegistryDirectory(): string {
  return join(defaultAppDataDirectory(), "registry");
}

export class RegistryDatabase {
  private readonly database: DatabaseSync;
  private readonly path: string;

  public constructor(databasePath: string = defaultDatabasePath()) {
    this.path = resolve(databasePath);
    mkdirSync(dirname(this.path), { recursive: true });
    this.database = new DatabaseSync(this.path);
    this.database.exec("PRAGMA foreign_keys = ON;");
  }

  public migrate(): RegistryDatabaseResult<number> {
    try {
      this.database.exec(
        "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);",
      );
      const applied = this.database
        .prepare("SELECT version FROM schema_migrations WHERE version = ?")
        .get(initialMigrationVersion) as { version?: number } | undefined;
      if (applied?.version !== initialMigrationVersion) {
        this.database.exec("BEGIN IMMEDIATE;");
        try {
          this.database.exec(INITIAL_MIGRATION);
          this.database
            .prepare(
              "INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)",
            )
            .run(initialMigrationVersion, new Date().toISOString());
          this.database.exec("COMMIT;");
        } catch (error) {
          this.database.exec("ROLLBACK;");
          throw error;
        }
      }
      return { ok: true, value: initialMigrationVersion };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "migration_failed",
          message: "SQLite migration failed.",
          details: [error instanceof Error ? error.message : String(error)],
        },
      };
    }
  }

  public prepare(sql: string): StatementSync {
    return this.database.prepare(sql);
  }

  public exec(sql: string): void {
    this.database.exec(sql);
  }

  public transaction(operation: () => void): void {
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      operation();
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  public close(): void {
    this.database.close();
  }

  public databasePath(): string {
    return this.path;
  }
}
