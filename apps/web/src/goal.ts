import type { JsonFetcher } from "./project-initialization";

export type Goal = Readonly<{
  readonly id: string;
  readonly title: string;
  readonly boundary: readonly string[];
  readonly risks: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly proposedBy: "project-lead-agent";
  readonly status:
    "draft" | "ready" | "in_progress" | "completed" | "paused" | "cancelled";
  readonly approval: Readonly<{
    readonly decidedBy: "user";
    readonly approved: boolean;
    readonly decidedAt: string;
  }> | null;
}>;

export type GoalSnapshot = Readonly<{
  readonly goal: Goal;
  readonly taskDrafts: readonly Readonly<{ readonly title: string }>[];
  readonly revision: number;
  readonly hash: string;
}>;

export type GoalsPayload = Readonly<{
  readonly projectKey: string;
  readonly projectRoot: string;
  readonly goals: readonly GoalSnapshot[];
}>;
export type GoalProposalPayload = Readonly<{
  readonly projectKey: string;
  readonly proposal: GoalSnapshot;
}>;
export type GoalDecisionPayload = Readonly<{
  readonly projectKey: string;
  readonly changed: boolean;
  readonly goal: GoalSnapshot;
}>;
export type GoalApiError = Readonly<{
  readonly code: string;
  readonly message: string;
  readonly details: readonly string[];
}>;
export type GoalApiResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: GoalApiError }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isGoalSnapshot(value: unknown): value is GoalSnapshot {
  if (
    !isRecord(value) ||
    !isRecord(value.goal) ||
    !Array.isArray(value.taskDrafts)
  )
    return false;
  const goal = value.goal;
  return (
    typeof goal.id === "string" &&
    typeof goal.title === "string" &&
    Array.isArray(goal.boundary) &&
    goal.boundary.every((item) => typeof item === "string") &&
    Array.isArray(goal.risks) &&
    goal.risks.every((item) => typeof item === "string") &&
    Array.isArray(goal.acceptanceCriteria) &&
    goal.acceptanceCriteria.every((item) => typeof item === "string") &&
    goal.proposedBy === "project-lead-agent" &&
    [
      "draft",
      "ready",
      "in_progress",
      "completed",
      "paused",
      "cancelled",
    ].includes(goal.status as string) &&
    (goal.approval === null || isRecord(goal.approval)) &&
    value.taskDrafts.every(
      (item) => isRecord(item) && typeof item.title === "string",
    ) &&
    typeof value.revision === "number" &&
    typeof value.hash === "string"
  );
}
export function parseGoalsPayload(value: unknown): GoalsPayload | null {
  return isRecord(value) &&
    typeof value.projectKey === "string" &&
    typeof value.projectRoot === "string" &&
    Array.isArray(value.goals) &&
    value.goals.every(isGoalSnapshot)
    ? (value as GoalsPayload)
    : null;
}
function parseProposal(value: unknown): GoalProposalPayload | null {
  return isRecord(value) &&
    typeof value.projectKey === "string" &&
    isGoalSnapshot(value.proposal)
    ? (value as GoalProposalPayload)
    : null;
}
function parseDecision(value: unknown): GoalDecisionPayload | null {
  return isRecord(value) &&
    typeof value.projectKey === "string" &&
    typeof value.changed === "boolean" &&
    isGoalSnapshot(value.goal)
    ? (value as GoalDecisionPayload)
    : null;
}
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
function errorFromPayload(value: unknown, status: number): GoalApiError {
  return isRecord(value) &&
    isRecord(value.error) &&
    typeof value.error.code === "string" &&
    typeof value.error.message === "string" &&
    Array.isArray(value.error.details) &&
    value.error.details.every((item) => typeof item === "string")
    ? (value.error as GoalApiError)
    : {
        code: `http_${status}`,
        message: "The goal service returned an invalid response.",
        details: [],
      };
}
async function request<Value>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  parse: (value: unknown) => Value | null,
  fetcher: JsonFetcher,
): Promise<GoalApiResult<Value>> {
  try {
    const response = await fetcher(input, init);
    const payload = await readJson(response);
    if (!response.ok || !isRecord(payload) || payload.ok !== true)
      return { ok: false, error: errorFromPayload(payload, response.status) };
    const value = parse(payload.value);
    return value === null
      ? {
          ok: false,
          error: {
            code: "invalid_response",
            message: "The goal response has an unexpected shape.",
            details: [],
          },
        }
      : { ok: true, value };
  } catch (error: unknown) {
    return {
      ok: false,
      error: {
        code: "network_error",
        message: "Unable to reach the goal service.",
        details: [error instanceof Error ? error.message : String(error)],
      },
    };
  }
}
export function requestGoals(
  projectKey: string,
  fetcher: JsonFetcher = fetch,
): Promise<GoalApiResult<GoalsPayload>> {
  return request(
    `/api/projects/goals?projectKey=${encodeURIComponent(projectKey)}`,
    undefined,
    parseGoalsPayload,
    fetcher,
  );
}
export function requestGoalProposal(
  input: Readonly<{
    readonly projectKey: string;
    readonly title: string;
    readonly boundary: readonly string[];
    readonly risks: readonly string[];
    readonly acceptanceCriteria: readonly string[];
    readonly taskDrafts: readonly Readonly<{ readonly title: string }>[];
  }>,
  fetcher: JsonFetcher = fetch,
): Promise<GoalApiResult<GoalProposalPayload>> {
  return request(
    "/api/projects/goals/propose",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    parseProposal,
    fetcher,
  );
}
export function requestGoalDecision(
  input: Readonly<{
    readonly projectKey: string;
    readonly goal: Goal;
    readonly taskDrafts: readonly Readonly<{ readonly title: string }>[];
    readonly approved: boolean;
  }>,
  fetcher: JsonFetcher = fetch,
): Promise<GoalApiResult<GoalDecisionPayload>> {
  return request(
    "/api/projects/goals/decision",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    parseDecision,
    fetcher,
  );
}
