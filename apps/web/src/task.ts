import type { JsonFetcher } from "./project-initialization";

export type Task = Readonly<{
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly goalId: string;
  readonly currentRole: string;
  readonly dependencies: readonly string[];
  readonly purpose: string;
  readonly scope: readonly string[];
  readonly outputs: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly requiredFiles: readonly string[];
  readonly onDemandFiles: readonly string[];
  readonly associatedDecisions: readonly string[];
  readonly allowedPaths: readonly string[];
  readonly forbiddenPaths: readonly string[];
  readonly run: Readonly<Record<string, unknown>>;
  readonly evidence: readonly string[];
  readonly customFieldDefinitions: readonly Readonly<Record<string, unknown>>[];
  readonly customFields: Readonly<Record<string, unknown>>;
  readonly completion: Readonly<Record<string, unknown>>;
}>;
export type TaskSnapshot = Readonly<{
  readonly task: Task;
  readonly revision: number;
  readonly hash: string;
}>;
export type TasksPayload = Readonly<{
  readonly projectKey: string;
  readonly projectRoot: string;
  readonly tasks: readonly TaskSnapshot[];
}>;
export type TaskApiError = Readonly<{
  readonly code: string;
  readonly message: string;
  readonly details: readonly string[];
}>;
export type TaskApiResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: TaskApiError }>;
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isSnapshot(value: unknown): value is TaskSnapshot {
  return (
    isRecord(value) &&
    isRecord(value.task) &&
    typeof value.task.id === "string" &&
    typeof value.task.title === "string" &&
    typeof value.task.status === "string" &&
    Array.isArray(value.task.dependencies) &&
    typeof value.revision === "number" &&
    typeof value.hash === "string"
  );
}
export function parseTasksPayload(value: unknown): TasksPayload | null {
  return isRecord(value) &&
    typeof value.projectKey === "string" &&
    typeof value.projectRoot === "string" &&
    Array.isArray(value.tasks) &&
    value.tasks.every(isSnapshot)
    ? (value as TasksPayload)
    : null;
}
function parseSnapshot(value: unknown): TaskSnapshot | null {
  return isSnapshot(value) ? value : null;
}
async function json(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
function error(value: unknown, status: number): TaskApiError {
  return isRecord(value) &&
    isRecord(value.error) &&
    typeof value.error.code === "string" &&
    typeof value.error.message === "string" &&
    Array.isArray(value.error.details)
    ? (value.error as TaskApiError)
    : {
        code: `http_${status}`,
        message: "The task service returned an invalid response.",
        details: [],
      };
}
async function request<Value>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  parse: (value: unknown) => Value | null,
  fetcher: JsonFetcher,
): Promise<TaskApiResult<Value>> {
  try {
    const response = await fetcher(input, init);
    const payload = await json(response);
    if (!response.ok || !isRecord(payload) || payload.ok !== true)
      return { ok: false, error: error(payload, response.status) };
    const value = parse(payload.value);
    return value === null
      ? {
          ok: false,
          error: {
            code: "invalid_response",
            message: "The task response has an unexpected shape.",
            details: [],
          },
        }
      : { ok: true, value };
  } catch (caught: unknown) {
    return {
      ok: false,
      error: {
        code: "network_error",
        message: "Unable to reach the task service.",
        details: [caught instanceof Error ? caught.message : String(caught)],
      },
    };
  }
}
function post<Value>(
  path: string,
  body: unknown,
  parse: (value: unknown) => Value | null,
  fetcher: JsonFetcher,
): Promise<TaskApiResult<Value>> {
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
export function requestTasks(
  projectKey: string,
  fetcher: JsonFetcher = fetch,
): Promise<TaskApiResult<TasksPayload>> {
  return request(
    `/api/projects/tasks?projectKey=${encodeURIComponent(projectKey)}`,
    undefined,
    parseTasksPayload,
    fetcher,
  );
}
export function createTask(
  input: Readonly<Record<string, unknown>>,
  fetcher: JsonFetcher = fetch,
): Promise<TaskApiResult<TaskSnapshot>> {
  return post("/api/projects/tasks", input, parseSnapshot, fetcher);
}
export function updateTask(
  input: Readonly<Record<string, unknown>>,
  fetcher: JsonFetcher = fetch,
): Promise<TaskApiResult<TaskSnapshot>> {
  return post("/api/projects/tasks/update", input, parseSnapshot, fetcher);
}
export function readyTask(
  input: Readonly<Record<string, unknown>>,
  fetcher: JsonFetcher = fetch,
): Promise<TaskApiResult<TaskSnapshot>> {
  return post("/api/projects/tasks/ready", input, parseSnapshot, fetcher);
}
