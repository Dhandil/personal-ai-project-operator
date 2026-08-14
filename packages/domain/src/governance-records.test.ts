import { describe, expect, it } from "vitest";

import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";

import { approvalTypes, createApproval, decideApproval } from "./approval.js";
import { createDecision, decideDecision } from "./decision.js";
import { completeHandoff, createHandoff } from "./handoff.js";
import {
  createIssue,
  hasAffectedTask,
  linkDecisionToIssue,
  recordIssueDiscussion,
  resolveIssue,
} from "./issue.js";

const timestamp = parseUtcIsoTimestamp("2026-08-14T00:00:00Z");

describe("governance records", () => {
  it("models the five fixed approval gates and user decisions", () => {
    expect(approvalTypes).toHaveLength(5);
    const pending = createApproval({
      id: "TASK-008",
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      relatedObjectIds: ["GOAL-002"],
      approvalType: "short_term_goal_start",
      subjectId: "GOAL-002",
      requestedBy: "agent",
      request: "Start the approved short-term goal.",
    });
    expect(pending.ok).toBe(true);
    if (!pending.ok) {
      throw new Error(pending.error.message);
    }

    const decided = decideApproval(pending.value, {
      decidedBy: "user",
      outcome: "approved",
      decidedAt: timestamp,
      note: "Approved within the goal boundary.",
    });
    expect(decided.ok).toBe(true);
    if (decided.ok) {
      expect(decided.value.status).toBe("completed");
      expect(decided.value.decision?.decidedBy).toBe("user");
      expect(decided.value.id).toBe("TASK-008");
      expect(decided.value.revision).toBe(1);
    }
  });

  it("preserves issue discussion, affected tasks, decisions, and recovery", () => {
    const created = createIssue({
      id: "TASK-008",
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      relatedObjectIds: ["GOAL-002"],
      title: "A decision is blocked",
      description: "The task needs a user decision before it can continue.",
      severity: "high",
      impact: "task",
      affectedTaskIds: ["TASK-008"],
      affectedObjectIds: ["GOAL-002"],
      discussion: ["Agent identified two options."],
      recoveryPlan: "Resume the affected task after the decision.",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error(created.error.message);
    }
    expect(hasAffectedTask(created.value, "TASK-008")).toBe(true);

    const discussed = recordIssueDiscussion(
      created.value,
      "User input is required.",
    );
    expect(discussed.ok).toBe(true);
    if (!discussed.ok) {
      throw new Error(discussed.error.message);
    }
    const linked = linkDecisionToIssue(discussed.value, "DEC-001");
    expect(linked.ok).toBe(true);
    if (!linked.ok) {
      throw new Error(linked.error.message);
    }
    const resolved = resolveIssue(
      linked.value,
      "User selected the safe option.",
    );
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.value.status).toBe("completed");
      expect(resolved.value.decisionIds).toEqual(["DEC-001"]);
      expect(resolved.value.recoveryPlan).toContain("Resume");
      expect(created.value.discussion).toHaveLength(1);
    }
  });

  it("requires a valid user choice and rationale for decisions", () => {
    const proposed = createDecision({
      id: "DEC-001",
      revision: 2,
      createdAt: timestamp,
      updatedAt: timestamp,
      relatedObjectIds: ["TASK-008"],
      question: "Which option should be used?",
      options: ["safe", "fast"],
      proposedBy: "agent",
      sourceIssueId: "TASK-008",
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) {
      throw new Error(proposed.error.message);
    }

    const invalid = decideDecision(proposed.value, {
      decidedBy: "user",
      selectedOption: "unknown",
      rationale: "Not one of the options.",
      decidedAt: timestamp,
    });
    expect(invalid).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid_decision" }),
    });

    const decided = decideDecision(proposed.value, {
      decidedBy: "user",
      selectedOption: "safe",
      rationale: "It keeps the approved boundary intact.",
      decidedAt: timestamp,
    });
    expect(decided.ok).toBe(true);
    if (decided.ok) {
      expect(decided.value.status).toBe("completed");
      expect(decided.value.decision?.selectedOption).toBe("safe");
    }
  });

  it("requires actual outputs and verification evidence in handoffs", () => {
    const incomplete = createHandoff({
      id: "HANDOFF-001",
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      relatedObjectIds: ["TASK-008"],
      goalId: "GOAL-002",
      taskId: "TASK-008",
      fromRole: "executor",
      toRole: "reviewer",
      summary: "Implementation is ready for review.",
      outputs: [],
      verificationEvidence: [],
      openIssueIds: [],
      reportIds: [],
      executionIds: [],
    });
    expect(incomplete).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid_handoff" }),
    });

    const created = createHandoff({
      id: "HANDOFF-001",
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      relatedObjectIds: ["TASK-008"],
      goalId: "GOAL-002",
      taskId: "TASK-008",
      fromRole: "executor",
      toRole: "reviewer",
      summary: "Implementation is ready for review.",
      outputs: [
        {
          reference: "packages/domain/src/approval.ts",
          description: "Approval model",
        },
      ],
      verificationEvidence: [
        {
          reference: "npm run test:unit -- governance-records",
          description: "Governance record tests",
        },
      ],
      openIssueIds: [],
      reportIds: ["REPORT-008"],
      executionIds: ["EXEC-001"],
    });
    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.value.relatedObjectIds).toEqual(
        expect.arrayContaining([
          "GOAL-002",
          "TASK-008",
          "REPORT-008",
          "EXEC-001",
        ]),
      );
      const completed = completeHandoff(created.value);
      expect(completed.ok).toBe(true);
      if (completed.ok) {
        expect(completed.value.status).toBe("completed");
        expect(completed.value.id).toBe("HANDOFF-001");
      }
    }
  });
});
