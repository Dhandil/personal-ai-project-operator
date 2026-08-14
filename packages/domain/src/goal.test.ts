import { describe, expect, it } from "vitest";

import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";

import {
  createGoalProposal,
  decideGoal,
  isApprovedGoal,
  startGoal,
} from "./goal.js";

const decidedAt = parseUtcIsoTimestamp("2026-08-14T00:00:00Z");

function makeGoal() {
  const result = createGoalProposal({
    id: "GOAL-002",
    title: "Deliver the first short-term goal",
    boundary: ["domain models"],
    risks: ["scope drift"],
    acceptanceCriteria: ["models are immutable"],
  });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

describe("goal model", () => {
  it("creates a project-lead proposal without user approval", () => {
    const goal = makeGoal();

    expect(goal.status).toBe("draft");
    expect(goal.proposedBy).toBe("project-lead-agent");
    expect(goal.approval).toBeNull();
    expect(isApprovedGoal(goal)).toBe(false);
  });

  it("requires a user decision before a goal can start", () => {
    const goal = makeGoal();
    const blocked = startGoal(goal);

    expect(blocked).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "goal_not_approved" }),
    });

    const decided = decideGoal(goal, { approved: true, decidedAt });
    expect(decided.ok).toBe(true);
    if (!decided.ok) {
      throw new Error(decided.error.message);
    }
    expect(decided.value.status).toBe("ready");
    expect(decided.value.approval?.decidedBy).toBe("user");

    const started = startGoal(decided.value);
    expect(started.ok).toBe(true);
    if (started.ok) {
      expect(started.value.status).toBe("in_progress");
      expect(isApprovedGoal(started.value)).toBe(true);
    }
  });

  it("records a user rejection as a cancelled goal", () => {
    const result = decideGoal(makeGoal(), { approved: false, decidedAt });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("cancelled");
      expect(result.value.approval?.approved).toBe(false);
      expect(isApprovedGoal(result.value)).toBe(false);
    }
  });
});
