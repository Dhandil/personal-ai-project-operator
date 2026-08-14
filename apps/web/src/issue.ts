import type { JsonFetcher } from "./project-initialization";

export type Issue = Readonly<{
  readonly id: string;
  readonly status: "draft" | "in_progress" | "completed" | "cancelled";
  readonly title: string;
  readonly description: string;
  readonly severity: "low" | "medium" | "high" | "blocker";
  readonly impact: "unknown" | "task" | "execution_chain" | "goal";
  readonly affectedTaskIds: readonly string[];
  readonly affectedObjectIds: readonly string[];
  readonly discussion: readonly string[];
  readonly decisionIds: readonly string[];
  readonly recoveryPlan: string | null;
  readonly resolution: string | null;
}>;
export type Decision = Readonly<{
  readonly id: string;
  readonly status: "draft" | "completed" | "cancelled";
  readonly question: string;
  readonly options: readonly string[];
  readonly proposedBy: "agent" | "user";
  readonly sourceIssueId: string | null;
  readonly decision: Readonly<{
    readonly selectedOption: string;
    readonly rationale: string;
    readonly decidedAt: string;
  }> | null;
}>;
export type IssueSnapshot = Readonly<{
  readonly issue: Issue;
  readonly revision: number;
  readonly hash: string;
}>;
export type DecisionSnapshot = Readonly<{
  readonly decision: Decision;
  readonly revision: number;
  readonly hash: string;
}>;
export type IssuesPayload = Readonly<{
  readonly projectKey: string;
  readonly projectRoot: string;
  readonly issues: readonly IssueSnapshot[];
  readonly decisions: readonly DecisionSnapshot[];
}>;
export type IssueAction = Readonly<{
  readonly projectKey: string;
  readonly issue: IssueSnapshot;
  readonly decision: DecisionSnapshot | null;
  readonly pausedTaskIds: readonly string[];
  readonly missingTaskIds: readonly string[];
  readonly executionChainPaused: boolean;
}>;
export type IssueApiError = Readonly<{
  readonly code: string;
  readonly message: string;
  readonly details: readonly string[];
}>;
export type IssueApiResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: IssueApiError }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isIssueSnapshot(value: unknown): value is IssueSnapshot {
  if (!isRecord(value) || !isRecord(value.issue)) return false;
  const issue = value.issue;
  return (
    typeof issue.id === "string" &&
    typeof issue.status === "string" &&
    typeof issue.title === "string" &&
    typeof issue.description === "string" &&
    typeof issue.severity === "string" &&
    typeof issue.impact === "string" &&
    Array.isArray(issue.affectedTaskIds) &&
    Array.isArray(issue.discussion) &&
    Array.isArray(issue.decisionIds) &&
    typeof value.revision === "number" &&
    typeof value.hash === "string"
  );
}
function isDecisionSnapshot(value: unknown): value is DecisionSnapshot {
  if (!isRecord(value) || !isRecord(value.decision)) return false;
  const decision = value.decision;
  return (
    typeof decision.id === "string" &&
    typeof decision.status === "string" &&
    typeof decision.question === "string" &&
    Array.isArray(decision.options) &&
    typeof value.revision === "number" &&
    typeof value.hash === "string"
  );
}
export function parseIssuesPayload(value: unknown): IssuesPayload | null {
  return isRecord(value) &&
    typeof value.projectKey === "string" &&
    typeof value.projectRoot === "string" &&
    Array.isArray(value.issues) &&
    value.issues.every(isIssueSnapshot) &&
    Array.isArray(value.decisions) &&
    value.decisions.every(isDecisionSnapshot)
    ? (value as IssuesPayload)
    : null;
}
function parseAction(value: unknown): IssueAction | null {
  return isRecord(value) &&
    typeof value.projectKey === "string" &&
    isIssueSnapshot(value.issue) &&
    (value.decision === null || isDecisionSnapshot(value.decision)) &&
    Array.isArray(value.pausedTaskIds) &&
    Array.isArray(value.missingTaskIds) &&
    typeof value.executionChainPaused === "boolean"
    ? (value as IssueAction)
    : null;
}
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
function errorFrom(value: unknown, status: number): IssueApiError {
  return isRecord(value) &&
    isRecord(value.error) &&
    typeof value.error.code === "string" &&
    typeof value.error.message === "string" &&
    Array.isArray(value.error.details)
    ? (value.error as IssueApiError)
    : {
        code: `http_${status}`,
        message: "The issue service returned an invalid response.",
        details: [],
      };
}
async function request<Value>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  parse: (value: unknown) => Value | null,
  fetcher: JsonFetcher,
): Promise<IssueApiResult<Value>> {
  try {
    const response = await fetcher(input, init);
    const payload = await readJson(response);
    if (!response.ok || !isRecord(payload) || payload.ok !== true)
      return { ok: false, error: errorFrom(payload, response.status) };
    const value = parse(payload.value);
    return value === null
      ? {
          ok: false,
          error: {
            code: "invalid_response",
            message: "The issue response has an unexpected shape.",
            details: [],
          },
        }
      : { ok: true, value };
  } catch (error: unknown) {
    return {
      ok: false,
      error: {
        code: "network_error",
        message: "Unable to reach the issue service.",
        details: [error instanceof Error ? error.message : String(error)],
      },
    };
  }
}
function post<Value>(
  path: string,
  body: unknown,
  parse: (value: unknown) => Value | null,
  fetcher: JsonFetcher,
): Promise<IssueApiResult<Value>> {
  return request(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    parse,
    fetcher,
  );
}
export function requestIssues(
  projectKey: string,
  fetcher: JsonFetcher = fetch,
): Promise<IssueApiResult<IssuesPayload>> {
  return request(
    `/api/projects/issues?projectKey=${encodeURIComponent(projectKey)}`,
    undefined,
    parseIssuesPayload,
    fetcher,
  );
}
export function createIssue(
  input: Readonly<Record<string, unknown>>,
  fetcher: JsonFetcher = fetch,
): Promise<IssueApiResult<IssueAction>> {
  return post("/api/projects/issues", input, parseAction, fetcher);
}
export function recordIssueDecision(
  input: Readonly<Record<string, unknown>>,
  fetcher: JsonFetcher = fetch,
): Promise<IssueApiResult<IssueAction>> {
  return post("/api/projects/issues/decision", input, parseAction, fetcher);
}
export function recoverIssue(
  input: Readonly<Record<string, unknown>>,
  fetcher: JsonFetcher = fetch,
): Promise<IssueApiResult<IssueAction>> {
  return post("/api/projects/issues/recover", input, parseAction, fetcher);
}
