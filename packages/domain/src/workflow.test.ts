import { describe, expect, it } from "vitest";

import {
  DEFAULT_STAGE_DEFINITIONS,
  applyStageSkipDecision,
  completeStage,
  createDefaultWorkflow,
  startStage,
  suggestStageSkip,
} from "./workflow.js";

describe("default workflow", () => {
  it("matches the confirmed Spec order exactly", () => {
    expect(DEFAULT_STAGE_DEFINITIONS.map((stage) => stage.title)).toEqual([
      "想法澄清",
      "问题定义",
      "用户场景",
      "Discovery 验证",
      "产品需求",
      "MVP 范围",
      "系统方案",
      "开发计划",
      "第一个短期目标",
      "执行",
    ]);
  });

  it("starts with the first stage as the current draft stage", () => {
    const workflow = createDefaultWorkflow();

    expect(workflow.stages).toHaveLength(10);
    expect(workflow.currentStage).toBe("idea-clarification");
    expect(workflow.stages.every((stage) => stage.status === "draft")).toBe(
      true,
    );
  });
});

describe("stage transitions", () => {
  it("rejects starting a later stage before the current stage", () => {
    const result = startStage(createDefaultWorkflow(), "user-scenarios");

    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_stage_order",
        message: "只能按默认阶段顺序启动当前阶段",
      },
    });
  });

  it("requires completion before starting the next stage", () => {
    const started = startStage(createDefaultWorkflow(), "idea-clarification");
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const completed = completeStage(started.value, "idea-clarification");
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;

    const next = startStage(completed.value, "problem-definition");
    expect(next.ok).toBe(true);
    if (next.ok) {
      expect(next.value.currentStage).toBe("problem-definition");
    }
  });
});

describe("stage skip proposals", () => {
  it("keeps an agent suggestion separate from the workflow record", () => {
    const workflow = createDefaultWorkflow();
    const proposal = suggestStageSkip(
      workflow,
      "idea-clarification",
      "材料已充分",
    );

    expect(proposal).toEqual({
      ok: true,
      value: {
        stageKey: "idea-clarification",
        proposedBy: "agent",
        rationale: "材料已充分",
      },
    });
    expect(workflow.stages[0]?.status).toBe("draft");
  });

  it("requires a user decision and a reason before recording a skip", () => {
    const workflow = createDefaultWorkflow();
    const proposal = suggestStageSkip(
      workflow,
      "idea-clarification",
      "材料已充分",
    );
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    const missingReason = applyStageSkipDecision(workflow, proposal.value, {
      decidedBy: "user",
      approved: true,
      reason: " ",
    });
    expect(missingReason.ok).toBe(false);

    const recorded = applyStageSkipDecision(workflow, proposal.value, {
      decidedBy: "user",
      approved: true,
      reason: "用户确认材料已充分，批准跳过。",
    });
    expect(recorded.ok).toBe(true);
    if (recorded.ok) {
      expect(recorded.value.currentStage).toBe("problem-definition");
      expect(recorded.value.stages[0]).toMatchObject({
        status: "skipped",
        skipReason: "用户确认材料已充分，批准跳过。",
      });
    }
  });

  it("does not record a rejected agent suggestion", () => {
    const workflow = createDefaultWorkflow();
    const proposal = suggestStageSkip(
      workflow,
      "idea-clarification",
      "材料已充分",
    );
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    const rejected = applyStageSkipDecision(workflow, proposal.value, {
      decidedBy: "user",
      approved: false,
      reason: "用户决定继续该阶段。",
    });

    expect(rejected).toEqual({ ok: true, value: workflow });
  });

  it("rejects a skip suggestion without a rationale", () => {
    expect(
      suggestStageSkip(createDefaultWorkflow(), "idea-clarification", " ").ok,
    ).toBe(false);
  });
});
