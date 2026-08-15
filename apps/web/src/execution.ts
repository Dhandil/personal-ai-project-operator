import type { JsonFetcher } from "./project-initialization";

export type ExecutionRecovery = Readonly<{
  readonly required: true;
  readonly executionId: string;
  readonly taskId: string;
  readonly sessionId: string | null;
  readonly reason: string;
  readonly choices: readonly ["resume", "retry", "cancel"];
}>;

export type ExecutionRun = Readonly<{
  readonly executionId: string;
  readonly projectKey: string;
  readonly taskId: string;
  readonly goalId: string;
  readonly role: string;
  readonly status: string;
  readonly taskStatus: string;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly events: readonly Readonly<Record<string, unknown>>[];
  readonly result: Readonly<Record<string, unknown>> | null;
  readonly recovery: ExecutionRecovery | null;
  readonly cleanup?: Readonly<Record<string, unknown>> | null;
}>;

export type ExecutionState = Readonly<{
  readonly active: boolean;
  readonly run: ExecutionRun | null;
  readonly recovery: ExecutionRecovery | null;
}>;

export type ExecutionActionValue = Readonly<{
  readonly projectKey: string;
  readonly run: ExecutionRun;
}>;

export type ExecutionApiError = Readonly<{
  readonly code: string;
  readonly message: string;
  readonly details: readonly string[];
}>;

export type ExecutionApiResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: ExecutionApiError }>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recovery(value: unknown): ExecutionRecovery | null {
  if (value === null) return null;
  if (!record(value)) return null;
  return value.required === true &&
    typeof value.executionId === "string" &&
    typeof value.taskId === "string" &&
    (typeof value.sessionId === "string" || value.sessionId === null) &&
    typeof value.reason === "string" &&
    Array.isArray(value.choices) &&
    value.choices.length === 3 &&
    value.choices.every((choice) =>
      ["resume", "retry", "cancel"].includes(String(choice)),
    )
    ? (value as ExecutionRecovery)
    : null;
}

function run(value: unknown): ExecutionRun | null {
  if (!record(value)) return null;
  const currentRecovery = recovery(value.recovery);
  const valid =
    typeof value.executionId === "string" &&
    typeof value.projectKey === "string" &&
    typeof value.taskId === "string" &&
    typeof value.goalId === "string" &&
    typeof value.role === "string" &&
    typeof value.status === "string" &&
    typeof value.taskStatus === "string" &&
    typeof value.startedAt === "string" &&
    (typeof value.completedAt === "string" || value.completedAt === null) &&
    Array.isArray(value.events) &&
    value.events.every(record) &&
    (value.result === null || record(value.result)) &&
    (value.recovery === null || currentRecovery !== null);
  return valid ? (value as ExecutionRun) : null;
}

export function parseExecutionStatePayload(
  value: unknown,
): ExecutionState | null {
  if (!record(value)) return null;
  const currentRun = run(value.run);
  const currentRecovery = recovery(value.recovery);
  return typeof value.active === "boolean" &&
    (value.run === null || currentRun !== null) &&
    (value.recovery === null || currentRecovery !== null)
    ? { active: value.active, run: currentRun, recovery: currentRecovery }
    : null;
}

function errorFrom(value: unknown, status: number): ExecutionApiError {
  return record(value) &&
    record(value.error) &&
    typeof value.error.code === "string" &&
    typeof value.error.message === "string" &&
    Array.isArray(value.error.details)
    ? (value.error as ExecutionApiError)
    : {
        code: `http_${status}`,
        message: "执行服务返回了无法识别的结果。",
        details: [],
      };
}

async function json(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

export async function requestExecutionState(
  projectKey: string,
  fetcher: JsonFetcher = fetch,
): Promise<ExecutionApiResult<ExecutionState>> {
  try {
    const response = await fetcher(
      `/api/projects/execution?projectKey=${encodeURIComponent(projectKey)}`,
    );
    const payload = await json(response);
    if (!response.ok || !record(payload) || payload.ok !== true)
      return { ok: false, error: errorFrom(payload, response.status) };
    const value = parseExecutionStatePayload(payload.value);
    return value === null
      ? {
          ok: false,
          error: {
            code: "invalid_response",
            message: "执行状态响应格式不正确。",
            details: [],
          },
        }
      : { ok: true, value };
  } catch (caught: unknown) {
    return {
      ok: false,
      error: {
        code: "network_error",
        message: "无法连接执行服务。",
        details: [caught instanceof Error ? caught.message : String(caught)],
      },
    };
  }
}

export type ExecutionAction = "resume" | "retry" | "cancel";

export function requestExecutionAction(
  input: Readonly<{
    readonly projectKey: string;
    readonly executionId: string;
    readonly action: ExecutionAction;
  }>,
  fetcher: JsonFetcher = fetch,
): Promise<ExecutionApiResult<ExecutionActionValue>> {
  const endpoint = `/api/projects/execution/${input.action}`;
  return (async () => {
    try {
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectKey: input.projectKey,
          executionId: input.executionId,
        }),
      });
      const payload = await json(response);
      if (!response.ok || !record(payload) || payload.ok !== true)
        return { ok: false, error: errorFrom(payload, response.status) };
      if (
        !record(payload.value) ||
        typeof payload.value.projectKey !== "string"
      )
        return {
          ok: false,
          error: {
            code: "invalid_response",
            message: "恢复决策响应格式不正确。",
            details: [],
          },
        };
      const currentRun = run(payload.value.run);
      return currentRun === null
        ? {
            ok: false,
            error: {
              code: "invalid_response",
              message: "恢复决策没有返回执行记录。",
              details: [],
            },
          }
        : {
            ok: true,
            value: { projectKey: payload.value.projectKey, run: currentRun },
          };
    } catch (caught: unknown) {
      return {
        ok: false,
        error: {
          code: "network_error",
          message: "无法提交恢复决策。",
          details: [caught instanceof Error ? caught.message : String(caught)],
        },
      };
    }
  })();
}
