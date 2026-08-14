import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  parseFormalId,
  parseUtcIsoTimestamp,
} from "@personal-ai-operator/contracts";
import { buildApp } from "../src/app.js";
import {
  createAuditEvent,
  type AuditEvent,
} from "../src/infrastructure/audit/audit-event.js";
import { AuditLogRepository } from "../src/infrastructure/audit/audit-log-repository.js";
import { ProjectRegistryRepository } from "../src/infrastructure/registry/project-registry-repository.js";
import { ReportService } from "../src/infrastructure/reports/report-service.js";
import { SettingsService } from "../src/infrastructure/reports/settings-service.js";
import { SummaryScheduler } from "../src/infrastructure/reports/summary-scheduler.js";

const timestamp = parseUtcIsoTimestamp("2026-08-14T10:00:00Z");

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-reports-"));
  const projectRoot = join(root, "project");
  await mkdir(projectRoot, { recursive: true });
  const databasePath = join(root, "app.db");
  const registryDirectory = join(root, "registry");
  const registry = new ProjectRegistryRepository({
    databasePath,
    registryDirectory,
  });
  const registered = await registry.register({
    rootPath: projectRoot,
    name: "Reports fixture",
    registeredAt: timestamp,
  });
  registry.close();
  assert.equal(registered.ok, true);
  if (!registered.ok) throw new Error(registered.error.message);
  return {
    root,
    projectRoot,
    projectKey: registered.value.projectKey,
    databasePath,
    registryDirectory,
  };
}

function event(
  id: string,
  action: string,
  type: AuditEvent["type"],
  statusChange: AuditEvent["statusChange"] = null,
): AuditEvent {
  const created = createAuditEvent({
    id: parseFormalId(id) as AuditEvent["id"],
    occurredAt: timestamp,
    type,
    actor: "agent",
    action,
    relatedObjectIds: [parseFormalId("TASK-001")],
    executionId: parseFormalId(id) as AuditEvent["id"],
    statusChange,
    details: { evidence: "test fixture" },
  });
  if (!created.ok) throw new Error(created.error.message);
  return created.value;
}

function services(value: Awaited<ReturnType<typeof fixture>>) {
  const registryFactory = () =>
    new ProjectRegistryRepository({
      databasePath: value.databasePath,
      registryDirectory: value.registryDirectory,
    });
  return {
    report: new ReportService({ registryFactory }),
    settings: new SettingsService({ registryFactory }),
  };
}

test("reports derive immediate categories from audit evidence and SSE resumes after a cursor", async () => {
  const value = await fixture();
  try {
    const audit = new AuditLogRepository(value.projectRoot);
    await audit.append(
      event("EXEC-001", "task_completed", "status_changed", {
        from: "in_progress",
        to: "completed",
        reason: "verified",
      }),
    );
    await audit.append(
      event("EXEC-002", "privilege_violation_detected", "privilege_violation"),
    );
    await audit.append(event("EXEC-003", "recovery_recorded", "recovery"));
    const { report } = services(value);
    const reports = await report.getReports(value.projectKey);
    assert.equal(reports.ok, true);
    if (!reports.ok) throw new Error(reports.error.message);
    assert.deepEqual(
      reports.value.reports.map((item) => item.kind),
      ["completion", "privilege_violation", "recovery"],
    );
    assert.equal(reports.value.reports[0]?.evidence[0]?.eventId, "EXEC-001");
    const app = buildApp({ reportService: report });
    const stream = await app.inject({
      method: "GET",
      url: `/api/projects/events?projectKey=${value.projectKey}&once=true`,
    });
    assert.equal(stream.statusCode, 200);
    assert.match(stream.body, /id: EXEC-001/);
    const resumed = await app.inject({
      method: "GET",
      url: `/api/projects/events?projectKey=${value.projectKey}&once=true`,
      headers: { "last-event-id": "EXEC-001" },
    });
    assert.equal(resumed.statusCode, 200);
    assert.doesNotMatch(resumed.body, /id: EXEC-001/);
    assert.match(resumed.body, /id: EXEC-002/);
    await app.close();
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("summary settings default to ten minutes and support a project override", async () => {
  const value = await fixture();
  try {
    const { settings } = services(value);
    const initial = settings.get(value.projectKey);
    assert.equal(initial.ok, true);
    if (!initial.ok) throw new Error(initial.error.message);
    assert.deepEqual(initial.value, {
      projectKey: value.projectKey,
      intervalMinutes: 10,
      source: "default",
    });
    const updated = settings.update({
      projectKey: value.projectKey,
      intervalMinutes: 15,
    });
    assert.equal(updated.ok, true);
    if (!updated.ok) throw new Error(updated.error.message);
    assert.equal(updated.value.intervalMinutes, 15);
    assert.equal(updated.value.source, "project");
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("summary scheduler uses the configured interval and reschedules after a summary", async () => {
  const timers: Array<{ callback: () => void; delay: number }> = [];
  const summaries: string[] = [];
  const scheduler = new SummaryScheduler({
    readIntervalMinutes: async () => 10,
    onSummary: (projectKey) => summaries.push(projectKey),
    setTimeout: ((callback: () => void, delay: number) => {
      timers.push({ callback, delay });
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout,
    clearTimeout: (() => undefined) as typeof clearTimeout,
  });
  assert.equal(await scheduler.start("project-1"), 10);
  assert.equal(timers[0]?.delay, 600_000);
  timers[0]?.callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(summaries, ["project-1"]);
  assert.equal(timers.length, 2);
  scheduler.stopAll();
});
