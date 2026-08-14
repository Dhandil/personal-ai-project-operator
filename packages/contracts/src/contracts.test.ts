import { describe, expect, it } from "vitest";

import {
  controlStatuses,
  formalIdSchema,
  idPrefixes,
  isFormalId,
  isRecordStatus,
  isUtcIsoTimestamp,
  normalStatuses,
  recordEnvelopeSchema,
  statusSchema,
  utcIsoTimestampSchema,
} from "./index.js";

describe("formal IDs", () => {
  it("accepts every confirmed prefix with a positive three-digit sequence", () => {
    for (const prefix of idPrefixes) {
      expect(formalIdSchema.parse(`${prefix}-001`)).toBe(`${prefix}-001`);
    }
  });

  it("rejects unknown prefixes, invalid sequences, and malformed IDs", () => {
    for (const value of ["PROJECT-001", "TASK-000", "TASK-01", "task-001"]) {
      expect(formalIdSchema.safeParse(value).success).toBe(false);
      expect(isFormalId(value)).toBe(false);
    }
  });
});

describe("statuses", () => {
  it("accepts exactly the confirmed normal and control statuses", () => {
    for (const status of [...normalStatuses, ...controlStatuses]) {
      expect(statusSchema.parse(status)).toBe(status);
      expect(isRecordStatus(status)).toBe(true);
    }
  });

  it("rejects statuses outside the confirmed model", () => {
    expect(statusSchema.safeParse("queued").success).toBe(false);
    expect(isRecordStatus("queued")).toBe(false);
  });
});

describe("UTC timestamps and record envelopes", () => {
  it("accepts valid UTC ISO timestamps and rejects non-UTC or invalid dates", () => {
    expect(utcIsoTimestampSchema.parse("2026-08-14T01:00:00Z")).toBe(
      "2026-08-14T01:00:00Z",
    );
    expect(isUtcIsoTimestamp("2026-08-14T01:00:00.123Z")).toBe(true);

    for (const value of [
      "2026-08-14T09:00:00+08:00",
      "2026-08-14",
      "2026-02-30T01:00:00Z",
      "2026-08-14T01:00:00",
    ]) {
      expect(utcIsoTimestampSchema.safeParse(value).success).toBe(false);
      expect(isUtcIsoTimestamp(value)).toBe(false);
    }
  });

  it("validates a shared input/output record envelope", () => {
    const envelope = recordEnvelopeSchema.parse({
      schemaVersion: 1,
      id: "TASK-005",
      status: "ready",
      revision: 1,
      createdAt: "2026-08-14T01:00:00Z",
      updatedAt: "2026-08-14T01:00:00Z",
    });

    expect(envelope.id).toBe("TASK-005");
    expect(
      recordEnvelopeSchema.safeParse({ ...envelope, schemaVersion: 2 }).success,
    ).toBe(false);
  });
});
