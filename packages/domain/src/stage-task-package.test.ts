import { describe, expect, it } from "vitest";

import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";

import {
  createPreflightRoleTemplates,
  createStageTaskPackage,
  getStageOutputRule,
  preflightRoleKeys,
} from "./stage-task-package.js";

const approvedIdea = {
  path: ".personal-workspace/stages/01-idea/01-idea.md",
  revision: 2,
  contentHash: "a".repeat(64),
  kind: "approved" as const,
};

describe("preflight role templates", () => {
  it("defines vendor-neutral project lead and four stage roles", () => {
    const roles = createPreflightRoleTemplates();

    expect(roles.map((role) => role.key)).toEqual(preflightRoleKeys);
    expect(
      roles.every(
        (role) =>
          role.responsibilities.length > 0 &&
          role.forbiddenActions.length > 0 &&
          role.mustRead.length > 0 &&
          role.onDemandRead.length > 0 &&
          role.outputSchemaId.length > 0,
      ),
    ).toBe(true);
    expect(JSON.stringify(roles)).not.toMatch(/claude|codex|model/i);
  });

  it("keeps each producer on its own stage output and protects formal facts", () => {
    const roles = createPreflightRoleTemplates();
    const idea = roles.find((role) => role.key === "idea");
    const discovery = roles.find((role) => role.key === "discovery");
    const planner = roles.find((role) => role.key === "planner");

    expect(idea?.allowedWritePaths).toEqual([
      ".personal-workspace/stages/01-idea/01-idea.md",
    ]);
    expect(discovery?.forbiddenWritePaths).toContain(
      ".personal-workspace/stages/01-idea/01-idea.md",
    );
    expect(planner?.forbiddenWritePaths).toContain(".personal-workspace/goals");
    expect(planner?.forbiddenActions.join(" ")).toContain(
      "without user approval",
    );
  });
});

describe("stage task packages", () => {
  it("contains the idea, approved context and a structured output rule", () => {
    const result = createStageTaskPackage({
      stageRunId: "STAGE-RUN-010",
      stage: "discovery",
      role: "discovery",
      projectIdea: "Clarify a governed project idea.",
      approvedArtifacts: [approvedIdea],
      currentGoal: null,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        kind: "stage_task_package",
        stage: "discovery",
        role: "discovery",
        projectIdea: "Clarify a governed project idea.",
        currentGoal: null,
        outputSchema: { id: "discovery_result_v1", version: 1 },
      });
      expect(result.value.approvedArtifacts).toEqual([approvedIdea]);
      expect(result.value.roleTemplate.mustRead).toContain(
        ".personal-workspace/stages/01-idea/01-idea.md",
      );
      expect(result.value.permissions).toEqual({
        mode: "workspace_write",
        canModifyStageArtifacts: true,
      });
    }
  });

  it("allows only approved prior artifacts and keeps the current goal explicit", () => {
    const invalidArtifact = createStageTaskPackage({
      stageRunId: "STAGE-RUN-011",
      stage: "spec",
      role: "spec",
      projectIdea: "A project idea.",
      approvedArtifacts: [{ ...approvedIdea, kind: "candidate" }],
      currentGoal: null,
    });
    expect(invalidArtifact).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid_stage_run" }),
    });

    const withGoal = createStageTaskPackage({
      stageRunId: "STAGE-RUN-012",
      stage: "planning",
      role: "planner",
      projectIdea: "A project idea.",
      approvedArtifacts: [
        approvedIdea,
        {
          path: ".personal-workspace/stages/03-spec/03-spec.md",
          revision: 3,
          contentHash: "b".repeat(64),
          kind: "approved",
        },
      ],
      currentGoal: {
        id: "GOAL-012",
        title: "A bounded goal",
        boundary: ["planning only"],
      },
    });
    expect(withGoal.ok).toBe(true);
    if (withGoal.ok) {
      expect(withGoal.value.currentGoal).toEqual({
        id: "GOAL-012",
        title: "A bounded goal",
        boundary: ["planning only"],
      });
    }
  });

  it("makes the stage reviewer read-only and output-only", () => {
    const result = createStageTaskPackage({
      stageRunId: "STAGE-RUN-013",
      stage: "spec",
      role: "reviewer",
      projectIdea: "A project idea.",
      approvedArtifacts: [approvedIdea],
      currentGoal: null,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.permissions).toEqual({
        mode: "read_only",
        canModifyStageArtifacts: false,
      });
      expect(result.value.roleTemplate.allowedWritePaths).toEqual([]);
      expect(result.value.roleTemplate.forbiddenWritePaths).toContain(
        ".personal-workspace/stages",
      );
      expect(result.value.outputSchema.id).toBe("stage_review_result_v1");
    }
  });

  it("rejects incompatible roles and incomplete package context", () => {
    expect(
      createStageTaskPackage({
        stageRunId: "STAGE-RUN-014",
        stage: "discovery",
        role: "idea",
        projectIdea: "A project idea.",
        approvedArtifacts: [],
        currentGoal: null,
      }),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid_stage_run" }),
    });

    expect(
      createStageTaskPackage({
        stageRunId: " ",
        stage: "idea",
        role: "idea",
        projectIdea: " ",
        approvedArtifacts: [],
        currentGoal: null,
      }),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid_stage_run" }),
    });
  });

  it("keeps structured output rules distinct and deterministic", () => {
    const ideaRule = getStageOutputRule("idea_result_v1");
    const planningRule = getStageOutputRule("planning_draft_v1");
    const reviewRule = getStageOutputRule("stage_review_result_v1");

    expect(ideaRule.requiredFields).toContain("artifactRefs");
    expect(planningRule.requiredFields).toContain("taskDrafts");
    expect(reviewRule.requiredFields).toContain("decision");
    expect(new Set([ideaRule.id, planningRule.id, reviewRule.id]).size).toBe(3);
    expect(ideaRule.description).toContain("候选");
  });

  it("uses timestamped approved references without introducing runtime bindings", () => {
    const timestamp = parseUtcIsoTimestamp("2026-08-16T00:00:00Z");
    expect(timestamp).toBeDefined();
    const roles = createPreflightRoleTemplates();
    expect(roles.every((role) => !Object.hasOwn(role, "runtime"))).toBe(true);
  });
});
