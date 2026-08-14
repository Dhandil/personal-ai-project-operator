import { describe, expect, it } from "vitest";

import {
  parseWorkflowPayload,
  requestSkipDecision,
  requestSkipProposal,
} from "./workflow";

const workflow = {
  projectKey: "a".repeat(64),
  projectRoot: "D:\\Projects\\demo",
  revision: 1,
  currentStage: "idea-clarification",
  stages: [
    {
      key: "idea-clarification",
      title: "Idea clarification",
      order: 1,
      status: "draft",
      artifacts: [
        {
          relativePath: ".personal-workspace/stages/01-idea/01-idea.md",
          state: "available",
        },
      ],
    },
  ],
};

function response(payload: unknown): Response {
  return new Response(JSON.stringify({ ok: true, value: payload }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("workflow API contracts", () => {
  it("requires stage artifact links and workflow state", () => {
    expect(parseWorkflowPayload(workflow)?.stages[0]?.artifacts[0]?.state).toBe(
      "available",
    );
    expect(
      parseWorkflowPayload({
        ...workflow,
        stages: [{ ...workflow.stages[0], artifacts: [] }],
      }),
    ).not.toBeNull();
  });

  it("keeps proposal and decision as separate API operations", async () => {
    const calls: string[] = [];
    const fetcher = async (input: RequestInfo | URL): Promise<Response> => {
      calls.push(String(input));
      return response(
        calls.length === 1
          ? {
              projectKey: workflow.projectKey,
              proposal: {
                stageKey: "idea-clarification",
                proposedBy: "agent",
                rationale: "Material is sufficient.",
              },
              explanation: {
                material: ["Idea"],
                missing: [],
                risks: ["Assumption"],
              },
              workflow,
            }
          : {
              projectKey: workflow.projectKey,
              changed: true,
              decision: {
                decidedBy: "user",
                approved: true,
                reason: "User approved.",
              },
              workflow: {
                ...workflow,
                currentStage: "problem-definition",
              },
            },
      );
    };

    const proposal = await requestSkipProposal(
      {
        projectKey: workflow.projectKey,
        stageKey: "idea-clarification",
        material: ["Idea"],
        missing: [],
        risks: ["Assumption"],
      },
      fetcher,
    );
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    const decision = await requestSkipDecision(
      {
        projectKey: workflow.projectKey,
        proposal: proposal.value.proposal,
        approved: true,
        reason: "User approved.",
      },
      fetcher,
    );
    expect(decision.ok).toBe(true);
    expect(calls).toEqual([
      "/api/projects/workflow/skip-proposal",
      "/api/projects/workflow/skip-decision",
    ]);
  });
});
