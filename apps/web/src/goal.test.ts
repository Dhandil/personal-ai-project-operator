import { describe, expect, it } from "vitest";

import {
  parseGoalsPayload,
  requestGoalDecision,
  requestGoalProposal,
} from "./goal";

const projectKey = "a".repeat(64);
const goal = {
  id: "GOAL-001",
  title: "First slice",
  boundary: ["domain"],
  risks: [],
  acceptanceCriteria: ["approved"],
  proposedBy: "project-lead-agent",
  status: "draft",
  approval: null,
} as const;
const snapshot = {
  goal,
  taskDrafts: [{ title: "First task" }],
  revision: 0,
  hash: "",
};
const response = (value: unknown): Response =>
  new Response(JSON.stringify({ ok: true, value }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("goal API contracts", () => {
  it("parses a goal proposal with fixed boundary fields", () => {
    expect(
      parseGoalsPayload({
        projectKey,
        projectRoot: "D:\\project",
        goals: [snapshot],
      })?.goals[0]?.goal.acceptanceCriteria,
    ).toEqual(["approved"]);
  });

  it("keeps proposal and user decision as separate requests", async () => {
    const calls: string[] = [];
    const fetcher = async (input: RequestInfo | URL): Promise<Response> => {
      calls.push(String(input));
      return response(
        calls.length === 1
          ? { projectKey, proposal: snapshot }
          : {
              projectKey,
              changed: true,
              goal: {
                ...snapshot,
                goal: {
                  ...goal,
                  status: "ready",
                  approval: {
                    decidedBy: "user",
                    approved: true,
                    decidedAt: "2026-08-14T08:00:00Z",
                  },
                },
                revision: 1,
                hash: "hash",
              },
            },
      );
    };
    const proposal = await requestGoalProposal(
      {
        projectKey,
        title: goal.title,
        boundary: goal.boundary,
        risks: goal.risks,
        acceptanceCriteria: goal.acceptanceCriteria,
        taskDrafts: snapshot.taskDrafts,
      },
      fetcher,
    );
    expect(proposal.ok).toBe(true);
    const decision = await requestGoalDecision(
      { projectKey, goal, taskDrafts: snapshot.taskDrafts, approved: true },
      fetcher,
    );
    expect(decision.ok).toBe(true);
    expect(calls).toEqual([
      "/api/projects/goals/propose",
      "/api/projects/goals/decision",
    ]);
  });
});
