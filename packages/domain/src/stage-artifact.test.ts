import { describe, expect, it } from "vitest";

import {
  stageArtifactKind,
  stageArtifactRequiredFields,
  validateStageArtifactPayload,
  validateStageReview,
} from "./stage-artifact.js";

const ideaPayload = {
  schemaVersion: 1,
  kind: "idea_result",
  stage: "idea",
  problemStatement: "People need a governed way to turn ideas into work.",
  assumptions: ["The user owns the local workspace."],
  openQuestions: [],
  artifactRefs: [],
  handoff: "Discovery should test the problem statement.",
};

describe("stage artifact schemas", () => {
  it("defines explicit stage kinds and required fields", () => {
    expect(stageArtifactKind("idea")).toBe("idea_result");
    expect(stageArtifactKind("discovery")).toBe("discovery_result");
    expect(stageArtifactKind("spec")).toBe("spec_result");
    expect(stageArtifactRequiredFields("planning")).toEqual([
      "goalDrafts",
      "roleDrafts",
      "taskDrafts",
      "dependencyGraph",
      "handoff",
    ]);
  });

  it("accepts a valid Idea payload and preserves unknown fields", () => {
    const result = validateStageArtifactPayload("idea", {
      ...ideaPayload,
      unknownField: { preserved: true },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.unknownField).toEqual({ preserved: true });
    }
  });

  it("rejects wrong stage, missing fields and invalid planning drafts", () => {
    expect(
      validateStageArtifactPayload("idea", {
        ...ideaPayload,
        stage: "spec",
      }),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid_stage_artifact" }),
    });
    expect(
      validateStageArtifactPayload("idea", {
        schemaVersion: 1,
        kind: "idea_result",
        stage: "idea",
      }),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid_stage_artifact" }),
    });
    expect(
      validateStageArtifactPayload("planning", {
        schemaVersion: 1,
        kind: "planning_draft",
        stage: "planning",
        goalDrafts: ["goal"],
        roleDrafts: ["role"],
        taskDrafts: ["task"],
        dependencyGraph: [],
        handoff: "Approve the planning draft.",
      }),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid_stage_artifact" }),
    });
  });

  it("requires structured changes for a changes-requested review", () => {
    expect(
      validateStageReview({
        stageRunId: "STAGE-RUN-001",
        stage: "idea",
        decision: "changes_requested",
        findings: [],
        requiredChanges: [],
        verificationEvidence: ["reviewed candidate"],
      }),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid_stage_review" }),
    });
    expect(
      validateStageReview({
        stageRunId: "STAGE-RUN-001",
        stage: "idea",
        decision: "accepted",
        findings: [],
        requiredChanges: [],
        verificationEvidence: ["reviewed candidate"],
      }).ok,
    ).toBe(true);
  });
});
