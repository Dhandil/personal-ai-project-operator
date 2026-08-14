import { describe, expect, it } from "vitest";

import {
  parseProjectListPayload,
  parseProjectStartupPayload,
  requestProjectList,
  requestProjectStartup,
} from "./project-overview";

const projectKey = "a".repeat(64);

const listPayload = {
  projects: [
    {
      projectKey,
      rootPath: "D:\\Projects\\demo",
      name: "Demo",
      archived: false,
      selected: true,
      state: "available",
      status: "in_progress",
      statusRevision: 3,
      statusHash: "b".repeat(64),
    },
  ],
  currentProjectKey: projectKey,
  selectionState: "selected",
};

const startupPayload = {
  started: true,
  autoStarted: false,
  needsRecovery: false,
  needsUserAction: true,
  action: "continue_with_user_approval",
  project: {
    projectKey,
    rootPath: "D:\\Projects\\demo",
    name: "Demo",
    idea: "A governed project",
  },
  currentStatus: {
    status: "in_progress",
    revision: 3,
    hash: "b".repeat(64),
  },
  summary: {
    goal: "A governed project",
    approvedShortTermGoal: "Ship the first slice",
    completedResults: "The project is initialized",
    currentTask: "TASK-021",
    blockersRisksDecisions: "No blocker",
    lastStep: "Created the overview",
    recommendedNext: "Review the current task",
    userActionNeeded: "Approve the next step",
  },
};

function fetcherFor(
  payload: unknown,
  status = 200,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

describe("project overview API contracts", () => {
  it("accepts a registry list with live status fields", () => {
    expect(parseProjectListPayload(listPayload)?.projects[0]?.status).toBe(
      "in_progress",
    );
  });

  it("rejects a list that is missing status provenance fields", () => {
    const invalid = {
      ...listPayload,
      projects: [{ ...listPayload.projects[0], statusRevision: "3" }],
    };
    expect(parseProjectListPayload(invalid)).toBeNull();
  });

  it("accepts the complete startup summary contract", () => {
    expect(parseProjectStartupPayload(startupPayload)?.autoStarted).toBe(false);
  });

  it("requests the project list and startup endpoints", async () => {
    const list = await requestProjectList(
      fetcherFor({ ok: true, value: listPayload }),
    );
    expect(list.ok).toBe(true);
    const startup = await requestProjectStartup(
      projectKey,
      fetcherFor({ ok: true, value: startupPayload }),
    );
    expect(startup.ok).toBe(true);
    if (startup.ok) {
      expect(startup.value.summary?.recommendedNext).toBe(
        "Review the current task",
      );
    }
  });

  it("surfaces structured backend errors without inventing summary values", async () => {
    const result = await requestProjectList(
      fetcherFor(
        {
          ok: false,
          error: {
            code: "registry_failed",
            message: "Registry unavailable",
            details: ["app.db"],
          },
        },
        500,
      ),
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: "registry_failed",
        message: "Registry unavailable",
        details: ["app.db"],
      },
    });
  });
});
