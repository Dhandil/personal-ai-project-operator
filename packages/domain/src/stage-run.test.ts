import { describe, expect, it } from "vitest";

import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";

import {
  canTransitionStageRun,
  createStageRun,
  isStageRunApproved,
  stageRunStatuses,
  transitionStageRun,
} from "./stage-run.js";

const timestamp = parseUtcIsoTimestamp("2026-08-16T00:00:00Z");

function createRun() {
  const result = createStageRun({
    id: "STAGE-RUN-001",
    stageKey: "idea-clarification",
    currentRole: "project-lead",
    artifactRefs: [
      {
        path: ".personal-workspace/stages/01-idea/01-idea.md",
        revision: 1,
        contentHash: "a".repeat(64),
        kind: "candidate",
      },
    ],
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe("stage run model", () => {
  it("defines independent pending, review, approval, recovery and terminal states", () => {
    expect(stageRunStatuses).toEqual([
      "pending",
      "running",
      "awaiting_review",
      "changes_requested",
      "approved",
      "blocked",
      "cancelled",
      "recovering",
    ]);
  });

  it("keeps a run pending even when an artifact already exists", () => {
    const run = createRun();

    expect(run).toMatchObject({
      status: "pending",
      stageKey: "idea-clarification",
      currentRole: "project-lead",
      approvalRef: null,
    });
    expect(run.artifactRefs).toHaveLength(1);
    expect(isStageRunApproved(run)).toBe(false);
  });

  it("requires the explicit user approval reference before approval", () => {
    const running = transitionStageRun(createRun(), "running");
    expect(running.ok).toBe(true);
    if (!running.ok) return;

    const review = transitionStageRun(running.value, "awaiting_review");
    expect(review.ok).toBe(true);
    if (!review.ok) return;

    expect(transitionStageRun(review.value, "approved")).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "stage_approval_required" }),
    });

    const approved = transitionStageRun(review.value, "approved", {
      approval: {
        approvalId: "APPROVAL-012",
        revision: 1,
        outcome: "approved",
        decidedBy: "user",
        decidedAt: timestamp,
      },
    });
    expect(approved.ok).toBe(true);
    if (approved.ok) {
      expect(approved.value.status).toBe("approved");
      expect(isStageRunApproved(approved.value)).toBe(true);
    }
  });

  it("requires reasons for rework, blocking, cancellation and recovery", () => {
    const run = createRun();
    const running = transitionStageRun(run, "running");
    expect(running.ok).toBe(true);
    if (!running.ok) return;

    for (const status of ["blocked", "cancelled", "recovering"] as const) {
      expect(transitionStageRun(running.value, status)).toEqual({
        ok: false,
        error: expect.objectContaining({ code: "reason_required" }),
      });
    }

    const review = transitionStageRun(running.value, "awaiting_review");
    expect(review.ok).toBe(true);
    if (!review.ok) return;
    expect(transitionStageRun(review.value, "changes_requested")).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "reason_required" }),
    });
  });

  it("supports explicit recovery and rework without skipping approval", () => {
    const running = transitionStageRun(createRun(), "running");
    expect(running.ok).toBe(true);
    if (!running.ok) return;

    const interrupted = transitionStageRun(running.value, "recovering", {
      reason: "The stage run was interrupted before review.",
    });
    expect(interrupted.ok).toBe(true);
    if (!interrupted.ok) return;

    const recovered = transitionStageRun(interrupted.value, "running");
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) return;

    const review = transitionStageRun(recovered.value, "awaiting_review");
    expect(review.ok).toBe(true);
    if (!review.ok) return;

    const rework = transitionStageRun(review.value, "changes_requested", {
      reason: "The output needs a clearer problem statement.",
    });
    expect(rework.ok).toBe(true);
    if (!rework.ok) return;

    const restarted = transitionStageRun(rework.value, "running");
    expect(restarted.ok).toBe(true);
    if (restarted.ok) expect(restarted.value.attempt).toBe(2);
  });

  it("rejects illegal transitions and terminal state changes", () => {
    expect(canTransitionStageRun("pending", "approved")).toBe(false);
    expect(canTransitionStageRun("blocked", "running")).toBe(false);
    expect(canTransitionStageRun("approved", "running")).toBe(false);
    expect(canTransitionStageRun("cancelled", "recovering")).toBe(false);

    const cancelled = transitionStageRun(createRun(), "cancelled", {
      reason: "The user cancelled this stage run.",
    });
    expect(cancelled.ok).toBe(true);
    if (cancelled.ok) {
      expect(transitionStageRun(cancelled.value, "running")).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: "invalid_stage_run_transition",
        }),
      });
    }
  });

  it("rejects invalid stage, role and artifact references", () => {
    expect(
      createStageRun({
        id: "STAGE-RUN-002",
        stageKey: "idea-clarification",
        currentRole: "not-a-role" as "project-lead",
      }),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid_stage_run" }),
    });

    expect(
      createStageRun({
        id: "STAGE-RUN-003",
        stageKey: "idea-clarification",
        currentRole: "project-lead",
        artifactRefs: [
          {
            path: " ",
            revision: 0,
            contentHash: "",
            kind: "candidate",
          },
        ],
      }),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid_stage_run" }),
    });
  });
});
