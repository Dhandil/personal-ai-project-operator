import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  parseUtcIsoTimestamp,
  type ExecutionId,
  type FormalId,
} from "@personal-ai-operator/contracts";

import {
  createAuditEvent,
  type AuditEvent,
} from "../src/infrastructure/audit/audit-event.js";
import {
  decodeAuditLog,
  encodeAuditLog,
} from "../src/infrastructure/audit/audit-log-codec.js";
import {
  AuditLogRepository,
  auditLogRelativePath,
} from "../src/infrastructure/audit/audit-log-repository.js";
import { ProjectWriteQueue } from "../src/infrastructure/files/project-write-queue.js";

const timestamp = parseUtcIsoTimestamp("2026-08-14T04:00:00Z");

function makeEvent(
  id: ExecutionId,
  type: "failure" | "privilege_violation" | "recovery" | "status_changed",
  relatedObjectIds: readonly FormalId[] = ["TASK-012"],
): AuditEvent {
  const event = createAuditEvent({
    id,
    occurredAt: timestamp,
    type,
    actor: type === "privilege_violation" ? "reviewer" : "system",
    action: `${type} recorded`,
    relatedObjectIds,
    executionId: id,
    statusChange:
      type === "status_changed"
        ? { from: "in_progress", to: "completed", reason: "Evidence accepted" }
        : null,
    details: { source: "integration-test", retryable: type === "recovery" },
  });
  assert.equal(event.ok, true);
  if (!event.ok) {
    throw new Error(event.error.message);
  }
  return event.value;
}

async function createRepository(): Promise<
  Readonly<{
    readonly directory: string;
    readonly repository: AuditLogRepository;
  }>
> {
  const directory = await mkdtemp(join(tmpdir(), "personal-ai-audit-"));
  return {
    directory,
    repository: new AuditLogRepository(directory, new ProjectWriteQueue()),
  };
}

test("audit log appends independently parseable events and preserves relations", async () => {
  const { directory, repository } = await createRepository();
  try {
    const events = [
      makeEvent("EXEC-101", "failure", ["TASK-012", "GOAL-003"]),
      makeEvent("EXEC-102", "privilege_violation"),
      makeEvent("EXEC-103", "recovery"),
      makeEvent("EXEC-104", "status_changed"),
    ];

    for (const event of events) {
      const result = await repository.append(event);
      assert.equal(result.ok, true);
    }

    const logPath = join(directory, auditLogRelativePath);
    const raw = await readFile(logPath, "utf8");
    assert.equal(raw.split("\n").filter(Boolean).length, 4);
    assert.equal(raw.endsWith("\n"), true);

    const read = await repository.readAll();
    assert.equal(read.ok, true);
    if (!read.ok) {
      throw new Error(read.error.message);
    }
    assert.deepEqual(read.value, events);
    assert.deepEqual(read.value[0]?.relatedObjectIds, ["TASK-012", "GOAL-003"]);
    assert.equal(read.value[3]?.statusChange?.to, "completed");

    const duplicate = await repository.append(events[0]!);
    assert.equal(duplicate.ok, false);
    if (!duplicate.ok) {
      assert.equal(duplicate.error.code, "duplicate_event");
    }
    assert.equal(await readFile(logPath, "utf8"), raw);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("audit log serializes concurrent appends through the project queue", async () => {
  const { directory, repository } = await createRepository();
  try {
    const first = makeEvent("EXEC-105", "failure");
    const second = makeEvent("EXEC-106", "recovery");
    const results = await Promise.all([
      repository.append(first),
      repository.append(second),
    ]);
    assert.equal(results.filter((result) => result.ok).length, 2);

    const read = await repository.readAll();
    assert.equal(read.ok, true);
    if (!read.ok) {
      throw new Error(read.error.message);
    }
    assert.deepEqual(
      new Set(read.value.map((event) => event.id)),
      new Set(["EXEC-105", "EXEC-106"]),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("audit codec reports malformed tail and repository refuses to append to it", async () => {
  const { directory, repository } = await createRepository();
  try {
    const valid = makeEvent("EXEC-107", "failure");
    const encoded = encodeAuditLog([valid]);
    assert.equal(encoded.ok, true);
    if (!encoded.ok) {
      throw new Error("Could not encode fixture event.");
    }

    const logPath = join(directory, auditLogRelativePath);
    await mkdir(join(directory, ".personal-workspace", "audit"), {
      recursive: true,
    });
    await writeFile(
      logPath,
      `${encoded.value}{"schemaVersion":1,"id":`,
      "utf8",
    );
    const before = await readFile(logPath, "utf8");

    const decoded = decodeAuditLog(before);
    assert.equal(decoded.ok, false);
    if (!decoded.ok) {
      assert.equal(decoded.error.code, "corrupt_tail");
      assert.equal(decoded.error.line, 2);
    }

    const append = await repository.append(makeEvent("EXEC-108", "recovery"));
    assert.equal(append.ok, false);
    if (!append.ok) {
      assert.equal(append.error.code, "invalid_log");
      assert.equal(append.error.codecError?.code, "corrupt_tail");
    }
    assert.equal(await readFile(logPath, "utf8"), before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("audit codec rejects invalid UTF-8 and empty JSONL lines", async () => {
  const invalidUtf8 = decodeAuditLog(new Uint8Array([0xff, 0xfe]));
  assert.equal(invalidUtf8.ok, false);
  if (!invalidUtf8.ok) {
    assert.equal(invalidUtf8.error.code, "invalid_utf8");
  }

  const event = makeEvent("EXEC-109", "failure");
  const encoded = encodeAuditLog([event]);
  assert.equal(encoded.ok, true);
  if (!encoded.ok) {
    throw new Error("Could not encode fixture event.");
  }
  const emptyLine = decodeAuditLog(`${encoded.value}\n${encoded.value}`);
  assert.equal(emptyLine.ok, false);
  if (!emptyLine.ok) {
    assert.equal(emptyLine.error.code, "empty_line");
    assert.equal(emptyLine.error.line, 2);
  }
});
