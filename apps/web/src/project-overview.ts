import type { JsonFetcher } from "./project-initialization";

export type ProjectOverviewItem = Readonly<{
  readonly projectKey: string;
  readonly rootPath: string;
  readonly name: string;
  readonly archived: boolean;
  readonly selected: boolean;
  readonly state: "available" | "needs_recovery";
  readonly status: string;
  readonly statusRevision: number | null;
  readonly statusHash: string | null;
  readonly factsError?: Readonly<{
    readonly code: string;
    readonly message: string;
  }>;
}>;

export type ProjectListPayload = Readonly<{
  readonly projects: readonly ProjectOverviewItem[];
  readonly currentProjectKey: string | null;
  readonly selectionState: "selected" | "none" | "needs_recovery";
}>;

export type StartupSummary = Readonly<{
  readonly goal: string;
  readonly approvedShortTermGoal: string;
  readonly completedResults: string;
  readonly currentTask: string;
  readonly blockersRisksDecisions: string;
  readonly lastStep: string;
  readonly recommendedNext: string;
  readonly userActionNeeded: string;
}>;

export type ProjectStartupPayload = Readonly<{
  readonly started: boolean;
  readonly autoStarted: false;
  readonly needsRecovery: boolean;
  readonly needsUserAction: boolean;
  readonly action:
    "select_project" | "review_project_facts" | "continue_with_user_approval";
  readonly project: Readonly<{
    readonly projectKey: string;
    readonly rootPath: string;
    readonly name: string;
    readonly idea: string;
  }> | null;
  readonly currentStatus: Readonly<{
    readonly status: string;
    readonly revision: number;
    readonly hash: string;
  }> | null;
  readonly summary: StartupSummary | null;
}>;

export type OverviewApiError = Readonly<{
  readonly code: string;
  readonly message: string;
  readonly details: readonly string[];
}>;

export type OverviewApiResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: OverviewApiError }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProjectOverviewItem(value: unknown): value is ProjectOverviewItem {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.projectKey === "string" &&
    typeof value.rootPath === "string" &&
    typeof value.name === "string" &&
    typeof value.archived === "boolean" &&
    typeof value.selected === "boolean" &&
    (value.state === "available" || value.state === "needs_recovery") &&
    typeof value.status === "string" &&
    (typeof value.statusRevision === "number" ||
      value.statusRevision === null) &&
    (typeof value.statusHash === "string" || value.statusHash === null)
  );
}

export function parseProjectListPayload(
  value: unknown,
): ProjectListPayload | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    !Array.isArray(value.projects) ||
    !value.projects.every(isProjectOverviewItem) ||
    (typeof value.currentProjectKey !== "string" &&
      value.currentProjectKey !== null) ||
    !["selected", "none", "needs_recovery"].includes(
      value.selectionState as string,
    )
  ) {
    return null;
  }
  return value as ProjectListPayload;
}

function isSummary(value: unknown): value is StartupSummary {
  if (!isRecord(value)) {
    return false;
  }
  return [
    "goal",
    "approvedShortTermGoal",
    "completedResults",
    "currentTask",
    "blockersRisksDecisions",
    "lastStep",
    "recommendedNext",
    "userActionNeeded",
  ].every((key) => typeof value[key] === "string");
}

export function parseProjectStartupPayload(
  value: unknown,
): ProjectStartupPayload | null {
  if (!isRecord(value)) {
    return null;
  }
  const project = value.project;
  const currentStatus = value.currentStatus;
  const validProject =
    project === null ||
    (isRecord(project) &&
      typeof project.projectKey === "string" &&
      typeof project.rootPath === "string" &&
      typeof project.name === "string" &&
      typeof project.idea === "string");
  const validStatus =
    currentStatus === null ||
    (isRecord(currentStatus) &&
      typeof currentStatus.status === "string" &&
      typeof currentStatus.revision === "number" &&
      typeof currentStatus.hash === "string");
  const validAction = [
    "select_project",
    "review_project_facts",
    "continue_with_user_approval",
  ].includes(value.action as string);
  if (
    typeof value.started !== "boolean" ||
    value.autoStarted !== false ||
    typeof value.needsRecovery !== "boolean" ||
    typeof value.needsUserAction !== "boolean" ||
    !validAction ||
    !validProject ||
    !validStatus ||
    (value.summary !== null && !isSummary(value.summary))
  ) {
    return null;
  }
  return value as ProjectStartupPayload;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorFromPayload(payload: unknown, status: number): OverviewApiError {
  if (
    isRecord(payload) &&
    isRecord(payload.error) &&
    typeof payload.error.code === "string" &&
    typeof payload.error.message === "string" &&
    Array.isArray(payload.error.details) &&
    payload.error.details.every((detail) => typeof detail === "string")
  ) {
    return payload.error as OverviewApiError;
  }
  return {
    code: `http_${status}`,
    message: "服务返回了无法识别的结果。",
    details: [],
  };
}

export async function requestProjectList(
  fetcher: JsonFetcher = fetch,
): Promise<OverviewApiResult<ProjectListPayload>> {
  try {
    const response = await fetcher("/api/projects");
    const payload = await readJson(response);
    if (!response.ok || !isRecord(payload) || payload.ok !== true) {
      return { ok: false, error: errorFromPayload(payload, response.status) };
    }
    const value = parseProjectListPayload(payload.value);
    return value === null
      ? {
          ok: false,
          error: {
            code: "invalid_response",
            message: "项目列表响应格式不正确。",
            details: [],
          },
        }
      : { ok: true, value };
  } catch (error: unknown) {
    return {
      ok: false,
      error: {
        code: "network_error",
        message: "无法连接后端服务，请检查服务是否已启动。",
        details: [error instanceof Error ? error.message : String(error)],
      },
    };
  }
}

export async function selectCurrentProject(
  projectKey: string,
  fetcher: JsonFetcher = fetch,
): Promise<OverviewApiResult<ProjectListPayload>> {
  try {
    const response = await fetcher("/api/projects/current", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectKey }),
    });
    const payload = await readJson(response);
    if (!response.ok || !isRecord(payload) || payload.ok !== true) {
      return { ok: false, error: errorFromPayload(payload, response.status) };
    }
    const value = parseProjectListPayload(payload.value);
    return value === null
      ? {
          ok: false,
          error: {
            code: "invalid_response",
            message: "项目选择响应格式不正确。",
            details: [],
          },
        }
      : { ok: true, value };
  } catch (error: unknown) {
    return {
      ok: false,
      error: {
        code: "network_error",
        message: "无法保存当前项目选择。",
        details: [error instanceof Error ? error.message : String(error)],
      },
    };
  }
}

export async function requestProjectStartup(
  projectKey: string,
  fetcher: JsonFetcher = fetch,
): Promise<OverviewApiResult<ProjectStartupPayload>> {
  try {
    const response = await fetcher("/api/projects/startup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectKey }),
    });
    const payload = await readJson(response);
    if (!response.ok || !isRecord(payload) || payload.ok !== true) {
      return { ok: false, error: errorFromPayload(payload, response.status) };
    }
    const value = parseProjectStartupPayload(payload.value);
    return value === null
      ? {
          ok: false,
          error: {
            code: "invalid_response",
            message: "项目启动响应格式不正确。",
            details: [],
          },
        }
      : { ok: true, value };
  } catch (error: unknown) {
    return {
      ok: false,
      error: {
        code: "network_error",
        message: "无法读取项目启动摘要。",
        details: [error instanceof Error ? error.message : String(error)],
      },
    };
  }
}
