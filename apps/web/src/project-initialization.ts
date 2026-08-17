export type ProjectCreationForm = Readonly<{
  readonly projectRoot: string;
  readonly projectName: string;
  readonly idea: string;
}>;

export type ProjectCreationFormErrors = Readonly<{
  readonly projectRoot?: string;
  readonly idea?: string;
}>;

export type PlannedFile = Readonly<{
  readonly relativePath: string;
  readonly action: "create" | "conflict";
  readonly reason: string;
}>;

export type ProjectPreview = Readonly<{
  readonly projectRoot: string;
  readonly projectName: string;
  readonly idea: string;
  readonly plannedFiles: readonly PlannedFile[];
  readonly conflicts: readonly PlannedFile[];
  readonly defaultWorkflow: readonly Readonly<Record<string, unknown>>[];
  readonly defaultRoles: readonly Readonly<Record<string, unknown>>[];
  readonly defaultSettings: readonly Readonly<Record<string, unknown>>[];
  readonly git: Readonly<{
    readonly detected: Readonly<Record<string, unknown>>;
    readonly planned: Readonly<{
      readonly action: string;
      readonly commands: readonly string[];
      readonly approvalRequired: boolean;
    }>;
  }>;
}>;

export type InitializationError = Readonly<{
  readonly code: string;
  readonly message: string;
  readonly details: readonly string[];
  readonly recovery?: Readonly<Record<string, unknown>>;
}>;

export type InitializationExecution = Readonly<{
  readonly projectRoot: string;
  readonly projectKey: string;
  readonly filesCreated: readonly string[];
  readonly approvalId: string;
  readonly auditEventId: string;
  readonly git: Readonly<Record<string, unknown>>;
}>;

export type ProjectDirectorySelection = Readonly<{
  readonly projectRoot: string;
}>;

type ApiResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: InitializationError }>;

export type JsonFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlannedFile(value: unknown): value is PlannedFile {
  return (
    isRecord(value) &&
    typeof value.relativePath === "string" &&
    (value.action === "create" || value.action === "conflict") &&
    typeof value.reason === "string"
  );
}

function isPreview(value: unknown): value is ProjectPreview {
  if (!isRecord(value)) {
    return false;
  }
  const git = value.git;
  const plannedGit = isRecord(git) && git.planned;
  return (
    typeof value.projectRoot === "string" &&
    typeof value.projectName === "string" &&
    typeof value.idea === "string" &&
    Array.isArray(value.plannedFiles) &&
    value.plannedFiles.every(isPlannedFile) &&
    Array.isArray(value.conflicts) &&
    value.conflicts.every(isPlannedFile) &&
    Array.isArray(value.defaultWorkflow) &&
    value.defaultWorkflow.every(isRecord) &&
    Array.isArray(value.defaultRoles) &&
    value.defaultRoles.every(isRecord) &&
    Array.isArray(value.defaultSettings) &&
    value.defaultSettings.every(isRecord) &&
    isRecord(git) &&
    isRecord(git.detected) &&
    isRecord(plannedGit) &&
    typeof plannedGit.action === "string" &&
    Array.isArray(plannedGit.commands) &&
    plannedGit.commands.every((command) => typeof command === "string") &&
    typeof plannedGit.approvalRequired === "boolean"
  );
}

function isInitializationError(value: unknown): value is InitializationError {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    Array.isArray(value.details) &&
    value.details.every((detail) => typeof detail === "string")
  );
}

function isDirectorySelection(
  value: unknown,
): value is ProjectDirectorySelection {
  return isRecord(value) && typeof value.projectRoot === "string";
}

function isExecution(value: unknown): value is InitializationExecution {
  return (
    isRecord(value) &&
    typeof value.projectRoot === "string" &&
    typeof value.projectKey === "string" &&
    Array.isArray(value.filesCreated) &&
    value.filesCreated.every((file) => typeof file === "string") &&
    typeof value.approvalId === "string" &&
    typeof value.auditEventId === "string" &&
    isRecord(value.git)
  );
}

function errorFromPayload(
  payload: unknown,
  status: number,
): InitializationError {
  if (isRecord(payload) && isInitializationError(payload.error)) {
    return payload.error;
  }
  return {
    code: `http_${status}`,
    message: "服务返回了无法识别的结果。",
    details: [],
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function validateProjectCreationForm(
  form: ProjectCreationForm,
): ProjectCreationFormErrors {
  const errors: { projectRoot?: string; idea?: string } = {};
  if (form.projectRoot.trim().length === 0) {
    errors.projectRoot = "请选择或输入项目目录。";
  }
  if (form.idea.trim().length === 0) {
    errors.idea = "请输入项目想法。";
  }
  return errors;
}

export async function requestProjectDirectorySelection(
  fetcher: JsonFetcher = fetch,
): Promise<ApiResult<ProjectDirectorySelection>> {
  try {
    const response = await fetcher("/api/projects/select-directory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await readJson(response);
    if (
      !response.ok ||
      !isRecord(payload) ||
      payload.ok !== true ||
      !isDirectorySelection(payload.value)
    ) {
      return { ok: false, error: errorFromPayload(payload, response.status) };
    }
    return { ok: true, value: payload.value };
  } catch (error: unknown) {
    return {
      ok: false,
      error: {
        code: "network_error",
        message: "无法连接本机目录选择服务，请改为手动输入路径。",
        details: [error instanceof Error ? error.message : String(error)],
      },
    };
  }
}

export async function requestProjectPreview(
  form: ProjectCreationForm,
  fetcher: JsonFetcher = fetch,
): Promise<ApiResult<ProjectPreview>> {
  try {
    const response = await fetcher("/api/projects/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectRoot: form.projectRoot.trim(),
        projectName: form.projectName.trim() || undefined,
        idea: form.idea.trim(),
      }),
    });
    const payload = await readJson(response);
    if (!response.ok || !isRecord(payload) || payload.ok !== true) {
      return { ok: false, error: errorFromPayload(payload, response.status) };
    }
    if (!isPreview(payload.value)) {
      return {
        ok: false,
        error: {
          code: "invalid_response",
          message: "预览响应格式不正确。",
          details: [],
        },
      };
    }
    return { ok: true, value: payload.value };
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

export async function requestProjectInitialization(
  preview: ProjectPreview,
  approvalId: string,
  fetcher: JsonFetcher = fetch,
): Promise<ApiResult<InitializationExecution>> {
  try {
    const response = await fetcher("/api/projects/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preview,
        approval: { approved: true, approvalId },
      }),
    });
    const payload = await readJson(response);
    if (!response.ok || !isRecord(payload) || payload.ok !== true) {
      return { ok: false, error: errorFromPayload(payload, response.status) };
    }
    if (!isExecution(payload.value)) {
      return {
        ok: false,
        error: {
          code: "invalid_response",
          message: "创建响应格式不正确。",
          details: [],
        },
      };
    }
    return { ok: true, value: payload.value };
  } catch (error: unknown) {
    return {
      ok: false,
      error: {
        code: "network_error",
        message: "无法连接后端服务，请保留当前输入后重试。",
        details: [error instanceof Error ? error.message : String(error)],
      },
    };
  }
}
