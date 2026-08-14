import {
  parseFormalId,
  type FormalId,
  type ReportId,
  type UtcIsoTimestamp,
} from "@personal-ai-operator/contracts";
import type { AuditEvent } from "../audit/audit-event.js";
import { AuditLogRepository } from "../audit/audit-log-repository.js";
import {
  ProjectRegistryRepository,
  type ProjectIndexRecord,
} from "../registry/project-registry-repository.js";
import type { ProjectRegistryFactory } from "../projects/project-startup.js";
import { SseHub, type RealtimeEvent } from "./sse-hub.js";

export type ExecutionReportKind =
  | "completion"
  | "blocker"
  | "privilege_violation"
  | "recovery"
  | "decision"
  | "event";
export type ExecutionReport = Readonly<{
  readonly id: ReportId;
  readonly kind: ExecutionReportKind;
  readonly title: string;
  readonly summary: string;
  readonly relatedObjectIds: readonly FormalId[];
  readonly evidence: readonly Readonly<{
    readonly source: string;
    readonly eventId: string;
    readonly action: string;
  }>[];
  readonly occurredAt: UtcIsoTimestamp;
}>;
export type ReportPage = Readonly<{
  readonly projectKey: string;
  readonly reports: readonly ExecutionReport[];
}>;
export type ReportError = Readonly<{
  readonly code: string;
  readonly message: string;
  readonly details: readonly string[];
}>;
export type ReportResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: ReportError }>;
export type ReportServiceOptions = Readonly<{
  readonly registryFactory?: ProjectRegistryFactory;
  readonly hub?: SseHub;
}>;

function failure<Value>(
  code: string,
  message: string,
  details: readonly string[] = [],
): ReportResult<Value> {
  return { ok: false, error: { code, message, details } };
}
function reportKind(event: AuditEvent): ExecutionReportKind {
  if (event.type === "privilege_violation") return "privilege_violation";
  if (event.type === "recovery") return "recovery";
  if (event.action.includes("decision") || event.action.includes("awaiting"))
    return "decision";
  if (event.type === "status_changed" && event.statusChange?.to === "completed")
    return "completion";
  if (event.type === "status_changed" && event.statusChange?.to === "blocked")
    return "blocker";
  return "event";
}
function reportId(index: number): ReportId {
  return parseFormalId(`REPORT-${String(index).padStart(3, "0")}`) as ReportId;
}
function toReport(event: AuditEvent, index: number): ExecutionReport {
  const kind = reportKind(event);
  const title =
    kind === "completion"
      ? "Execution completed"
      : kind === "blocker"
        ? "Execution blocked"
        : kind === "decision"
          ? "User decision required or recorded"
          : kind === "recovery"
            ? "Execution recovered"
            : kind === "privilege_violation"
              ? "Privilege violation"
              : "Execution event";
  return {
    id: reportId(index),
    kind,
    title,
    summary: `${event.action}: ${
      Object.entries(event.details)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(", ") || "recorded"
    }.`,
    relatedObjectIds: event.relatedObjectIds,
    evidence: [
      {
        source: ".personal-workspace/audit/events.jsonl",
        eventId: event.id,
        action: event.action,
      },
    ],
    occurredAt: event.occurredAt,
  };
}
function toRealtime(
  projectKey: string,
  report: ExecutionReport,
): RealtimeEvent {
  return {
    id: report.evidence[0]?.eventId ?? report.id,
    projectKey,
    event: "report",
    occurredAt: report.occurredAt,
    payload: report,
  };
}

export class ReportService {
  public readonly hub: SseHub;
  private readonly registryFactory: ProjectRegistryFactory;

  public constructor(options: ReportServiceOptions = {}) {
    this.registryFactory =
      options.registryFactory ?? (() => new ProjectRegistryRepository());
    this.hub = options.hub ?? new SseHub();
  }

  public async getReports(
    projectKey: string,
  ): Promise<ReportResult<ReportPage>> {
    const project = await this.findProject(projectKey);
    if (!project.ok) return project;
    const events = await new AuditLogRepository(
      project.value.rootPath,
    ).readAll();
    if (!events.ok)
      return failure(
        "audit_failed",
        events.error.message,
        events.error.details,
      );
    return {
      ok: true,
      value: {
        projectKey,
        reports: events.value.map((event, index) => toReport(event, index + 1)),
      },
    };
  }

  public async replay(
    projectKey: string,
    lastEventId: string | null,
  ): Promise<ReportResult<readonly RealtimeEvent[]>> {
    const page = await this.getReports(projectKey);
    if (!page.ok) return page;
    for (const report of page.value.reports)
      this.hub.publish(toRealtime(projectKey, report));
    return { ok: true, value: this.hub.replay(projectKey, lastEventId) };
  }

  public async publishAuditEvent(
    projectKey: string,
    event: AuditEvent,
  ): Promise<ReportResult<ExecutionReport>> {
    const report = toReport(event, 1);
    this.hub.publish(toRealtime(projectKey, report));
    return { ok: true, value: report };
  }

  private async findProject(
    projectKey: string,
  ): Promise<ReportResult<ProjectIndexRecord>> {
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
