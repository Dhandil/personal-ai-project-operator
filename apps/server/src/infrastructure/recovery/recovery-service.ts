import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { createProject } from "@personal-ai-operator/domain";
import {
  parseFormalId,
  type ExecutionId,
  type UtcIsoTimestamp,
} from "@personal-ai-operator/contracts";

import {
  AuditLogRepository,
  auditLogRelativePath,
} from "../audit/audit-log-repository.js";
import type { AuditEvent } from "../audit/audit-event.js";
import { createAuditEvent } from "../audit/audit-event.js";
import { GovernanceRepository } from "../files/governance-repository.js";
import type { GovernanceDocument } from "../files/governance-codec.js";
import {
  ProjectRegistryRepository,
  type ProjectIndexRecord,
} from "../registry/project-registry-repository.js";
import type { ProjectRegistryFactory } from "../projects/project-startup.js";
import { StatusProjection } from "../status/status-projection.js";

export type HistoryKind = "fact" | "generated_snapshot" | "audit_event";
export type HistoryEntry = Readonly<{
  readonly kind: HistoryKind;
  readonly id: string;
  readonly relativePath: string;
  readonly revision: number | null;
  readonly hash: string | null;
  readonly occurredAt: string;
  readonly summary: string;
  readonly event?: AuditEvent;
}>;
export type HistoryPage = Readonly<{
  readonly projectKey: string;
  readonly entries: readonly HistoryEntry[];
}>;
export type RecoveryValue = Readonly<{
  readonly projectKey: string;
  readonly registryRebuilt: boolean;
  readonly statusRebuilt: boolean;
  readonly statusRevision: number;
  readonly pendingAuditEvents: readonly string[];
  readonly userDecisionsPreserved: readonly string[];
  readonly recoveryAction: "reloaded_from_project_facts";
}>;
export type RecoveryResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: RecoveryError }>;
export type RecoveryError = Readonly<{
  readonly code:
    | "invalid_input"
    | "registry_failed"
    | "project_not_found"
    | "invalid_facts"
    | "write_failed"
    | "audit_failed";
  readonly message: string;
  readonly details: readonly string[];
}>;
export type RecoveryServiceOptions = Readonly<{
  readonly registryFactory?: ProjectRegistryFactory;
  readonly now?: () => UtcIsoTimestamp;
}>;

function failure<Value>(
  code: RecoveryError["code"],
  message: string,
  details: readonly string[] = [],
): RecoveryResult<Value> {
  return { ok: false, error: { code, message, details } };
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nowUtc(): UtcIsoTimestamp {
  return new Date().toISOString() as UtcIsoTimestamp;
}
function frontText(document: GovernanceDocument, key: string): string {
  const value = document.frontMatter[key];
  return typeof value === "string" ? value : "";
}
function executionId(events: readonly AuditEvent[]): ExecutionId {
  const next =
    events.reduce((max, event) => Math.max(max, Number(event.id.slice(5))), 0) +
    1;
  return parseFormalId(`EXEC-${String(next).padStart(3, "0")}`) as ExecutionId;
}

export class RecoveryService {
  private readonly registryFactory: ProjectRegistryFactory;
  private readonly now: () => UtcIsoTimestamp;
  public constructor(options: RecoveryServiceOptions = {}) {
    this.registryFactory =
      options.registryFactory ?? (() => new ProjectRegistryRepository());
    this.now = options.now ?? nowUtc;
  }

  public async recover(input: unknown): Promise<RecoveryResult<RecoveryValue>> {
    if (!record(input) || typeof input.projectKey !== "string")
      return failure("invalid_input", "A projectKey is required.");
    let registry: ProjectRegistryRepository;
    try {
      registry = this.registryFactory();
    } catch (error) {
      return failure(
        "registry_failed",
        "Project registry could not be opened.",
        [String(error)],
      );
    }
    let project: ProjectIndexRecord | undefined;
    try {
      const rebuilt = await registry.rebuildFromRegistry();
      if (!rebuilt.ok)
        return failure(
          "registry_failed",
          rebuilt.error.message,
          rebuilt.error.details,
        );
      project = rebuilt.value.find(
        (item) => item.projectKey === input.projectKey && !item.archived,
      );
    } finally {
      registry.close();
    }
    if (project === undefined)
      return failure(
        "project_not_found",
        "Project registration marker was not found.",
      );
    const status = await this.rebuildStatus(project.rootPath);
    if (!status.ok) return status;
    const events = await new AuditLogRepository(project.rootPath).readAll();
    if (!events.ok)
      return failure(
        "audit_failed",
        events.error.message,
        events.error.details,
      );
    const audit = createAuditEvent({
      id: executionId(events.value),
      occurredAt: this.now(),
      type: "recovery",
      actor: "system",
      action: "project_recovered_from_facts",
      relatedObjectIds: [],
      executionId: executionId(events.value),
      details: { status_rebuilt: status.value.rebuilt, registry_rebuilt: true },
    });
    if (!audit.ok) return failure("audit_failed", audit.error.message);
    const appended = await new AuditLogRepository(project.rootPath).append(
      audit.value,
    );
    if (!appended.ok)
      return failure(
        "audit_failed",
        appended.error.message,
        appended.error.details,
      );
    const pending = events.value
      .filter(
        (event) =>
          event.action.includes("conflict") ||
          event.action.includes("awaiting"),
      )
      .map((event) => event.id);
    const decisions = events.value
      .filter(
        (event) =>
          event.action.includes("decision") ||
          event.action.includes("approval_"),
      )
      .map((event) => event.id);
    return {
      ok: true,
      value: {
        projectKey: input.projectKey,
        registryRebuilt: true,
        statusRebuilt: status.value.rebuilt,
        statusRevision: status.value.revision,
        pendingAuditEvents: pending,
        userDecisionsPreserved: decisions,
        recoveryAction: "reloaded_from_project_facts",
      },
    };
  }

  public async history(
    projectKey: string,
  ): Promise<RecoveryResult<HistoryPage>> {
    const project = await this.findProject(projectKey);
    if (!project.ok) return project;
    const entries: HistoryEntry[] = [];
    const collections = [
      "goals",
      "tasks",
      "approvals",
      "issues",
      "decisions",
      "handoffs",
      "reports",
      "executions",
    ] as const;
    for (const collection of collections) {
      let names: string[];
      try {
        names = (
          await readdir(
            join(project.value.rootPath, ".personal-workspace", collection),
          )
        ).filter(
          (name) =>
            name.endsWith(".md") && !name.toLowerCase().includes("readme"),
        );
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        )
          continue;
        return failure("invalid_facts", "Formal history could not be listed.", [
          String(error),
        ]);
      }
      for (const name of names.toSorted()) {
        const relativePath = `.personal-workspace/${collection}/${name}`;
        const read = await new GovernanceRepository(
          project.value.rootPath,
        ).read(relativePath);
        if (!read.ok)
          return failure(
            "invalid_facts",
            read.error.message,
            read.error.details,
          );
        const fm = read.value.document.frontMatter;
        const id =
          typeof fm.id === "string" ? fm.id : name.replace(/\.md$/, "");
        entries.push({
          kind: "fact",
          id,
          relativePath,
          revision: read.value.version.revision,
          hash: read.value.version.hash,
          occurredAt:
            frontText(read.value.document, "updated_at") ||
            frontText(read.value.document, "created_at"),
          summary:
            frontText(read.value.document, "title") ||
            frontText(read.value.document, "request") ||
            id,
        });
      }
    }
    const status = await new GovernanceRepository(project.value.rootPath).read(
      ".personal-workspace/status.md",
    );
    if (status.ok)
      entries.push({
        kind: "generated_snapshot",
        id: "status.md",
        relativePath: ".personal-workspace/status.md",
        revision: status.value.version.revision,
        hash: status.value.version.hash,
        occurredAt:
          frontText(status.value.document, "generated_at") ||
          frontText(status.value.document, "updated_at"),
        summary: "Generated current status snapshot",
      });
    const audit = await new AuditLogRepository(
      project.value.rootPath,
    ).readAll();
    if (!audit.ok)
      return failure("audit_failed", audit.error.message, audit.error.details);
    entries.push(
      ...audit.value.map((event) => ({
        kind: "audit_event" as const,
        id: event.id,
        relativePath: auditLogRelativePath,
        revision: null,
        hash: null,
        occurredAt: event.occurredAt,
        summary: event.action,
        event,
      })),
    );
    return {
      ok: true,
      value: {
        projectKey,
        entries: entries.toSorted(
          (left, right) =>
            left.occurredAt.localeCompare(right.occurredAt) ||
            left.id.localeCompare(right.id),
        ),
      },
    };
  }

  private async rebuildStatus(
    root: string,
  ): Promise<
    RecoveryResult<
      Readonly<{ readonly rebuilt: boolean; readonly revision: number }>
    >
  > {
    const projectRead = await new GovernanceRepository(root).read(
      ".personal-workspace/project.md",
    );
    if (!projectRead.ok)
      return failure(
        "invalid_facts",
        projectRead.error.message,
        projectRead.error.details,
      );
    const created = createProject({
      name: frontText(projectRead.value.document, "name"),
      idea: frontText(projectRead.value.document, "idea"),
    });
    if (!created.ok) return failure("invalid_facts", created.error.message);
    const current = await new StatusProjection(root).read();
    const revision = current.ok ? current.value.revision + 1 : 1;
    const generatedAt = this.now();
    const document: GovernanceDocument = {
      frontMatter: {
        schema_version: 1,
        document_type: "status_snapshot",
        revision,
        generated_at: generatedAt,
        updated_at: generatedAt,
        source: "domain_facts",
      },
      body: `# Project status\n\n- Project: ${created.value.name}\n- Idea: ${created.value.idea}\n- This snapshot is generated from project facts and may be rebuilt after restart.\n\n## Recovery\n- Registry index was rebuilt from registration markers.\n- Dynamic facts remain in the project workspace.\n`,
    };
    const written = await new GovernanceRepository(root).write(
      ".personal-workspace/status.md",
      document,
      current.ok
        ? { revision: current.value.revision, hash: current.value.hash }
        : null,
    );
    if (!written.ok)
      return failure(
        "write_failed",
        written.error.message,
        written.error.details,
      );
    return {
      ok: true,
      value: { rebuilt: true, revision: written.value.version.revision },
    };
  }
  private async findProject(
    projectKey: string,
  ): Promise<RecoveryResult<ProjectIndexRecord>> {
    let registry: ProjectRegistryRepository;
    try {
      registry = this.registryFactory();
    } catch (error) {
      return failure(
        "registry_failed",
        "Project registry could not be opened.",
        [String(error)],
      );
    }
    try {
      const listed = registry.list();
      if (!listed.ok)
        return failure(
          "registry_failed",
          listed.error.message,
          listed.error.details,
        );
      const project = listed.value.find(
        (item) => item.projectKey === projectKey && !item.archived,
      );
      return project === undefined
        ? failure("project_not_found", "Project is not registered or archived.")
        : { ok: true, value: project };
    } finally {
      registry.close();
    }
  }
}
