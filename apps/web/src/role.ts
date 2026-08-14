import type { JsonFetcher } from "./project-initialization";

export type Role = Readonly<{
  readonly key: string;
  readonly title: string;
  readonly responsibilities: readonly string[];
  readonly mustRead: readonly string[];
  readonly onDemandRead: readonly string[];
  readonly allowedActions: readonly string[];
  readonly forbiddenActions: readonly string[];
  readonly handoff: readonly string[];
}>;
export type RoleContextItem = Readonly<{
  readonly name: string;
  readonly required: boolean;
  readonly paths: readonly string[];
  readonly state: "available" | "missing";
}>;
export type RoleView = Readonly<{
  readonly role: Role;
  readonly source: "default" | "project";
  readonly relativePath: string;
  readonly fileState: "available" | "missing";
  readonly context: Readonly<{
    readonly mustRead: readonly RoleContextItem[];
    readonly onDemandRead: readonly RoleContextItem[];
  }>;
  readonly canModifyProjectFiles: boolean;
  readonly revision: number | null;
  readonly hash: string | null;
}>;
export type RolesPayload = Readonly<{
  readonly projectKey: string;
  readonly projectRoot: string;
  readonly roles: readonly RoleView[];
}>;
export type RoleApiError = Readonly<{
  readonly code: string;
  readonly message: string;
  readonly details: readonly string[];
}>;
export type RoleApiResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: RoleApiError }>;
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isRole(value: unknown): value is Role {
  if (!isRecord(value)) return false;
  return (
    typeof value.key === "string" &&
    typeof value.title === "string" &&
    [
      "responsibilities",
      "mustRead",
      "onDemandRead",
      "allowedActions",
      "forbiddenActions",
      "handoff",
    ].every(
      (key) =>
        Array.isArray(value[key]) &&
        (value[key] as unknown[]).every((item) => typeof item === "string"),
    )
  );
}
function isContext(value: unknown): value is RoleContextItem {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.required === "boolean" &&
    Array.isArray(value.paths) &&
    value.paths.every((item) => typeof item === "string") &&
    (value.state === "available" || value.state === "missing")
  );
}
function isRoleView(value: unknown): value is RoleView {
  return (
    isRecord(value) &&
    isRole(value.role) &&
    (value.source === "default" || value.source === "project") &&
    typeof value.relativePath === "string" &&
    (value.fileState === "available" || value.fileState === "missing") &&
    isRecord(value.context) &&
    Array.isArray(value.context.mustRead) &&
    value.context.mustRead.every(isContext) &&
    Array.isArray(value.context.onDemandRead) &&
    value.context.onDemandRead.every(isContext) &&
    typeof value.canModifyProjectFiles === "boolean" &&
    (typeof value.revision === "number" || value.revision === null) &&
    (typeof value.hash === "string" || value.hash === null)
  );
}
export function parseRolesPayload(value: unknown): RolesPayload | null {
  return isRecord(value) &&
    typeof value.projectKey === "string" &&
    typeof value.projectRoot === "string" &&
    Array.isArray(value.roles) &&
    value.roles.every(isRoleView)
    ? (value as RolesPayload)
    : null;
}
function parseRoleView(value: unknown): RoleView | null {
  return isRoleView(value) ? value : null;
}
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
function errorFrom(value: unknown, status: number): RoleApiError {
  return isRecord(value) &&
    isRecord(value.error) &&
    typeof value.error.code === "string" &&
    typeof value.error.message === "string" &&
    Array.isArray(value.error.details) &&
    value.error.details.every((item) => typeof item === "string")
    ? (value.error as RoleApiError)
    : {
        code: `http_${status}`,
        message: "The role service returned an invalid response.",
        details: [],
      };
}
async function request<Value>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  parse: (value: unknown) => Value | null,
  fetcher: JsonFetcher,
): Promise<RoleApiResult<Value>> {
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
            message: "The role response has an unexpected shape.",
            details: [],
          },
        }
      : { ok: true, value };
  } catch (error: unknown) {
    return {
      ok: false,
      error: {
        code: "network_error",
        message: "Unable to reach the role service.",
        details: [error instanceof Error ? error.message : String(error)],
      },
    };
  }
}
export function requestRoles(
  projectKey: string,
  fetcher: JsonFetcher = fetch,
): Promise<RoleApiResult<RolesPayload>> {
  return request(
    `/api/projects/roles?projectKey=${encodeURIComponent(projectKey)}`,
    undefined,
    parseRolesPayload,
    fetcher,
  );
}
export function updateRole(
  projectKey: string,
  role: Role,
  fetcher: JsonFetcher = fetch,
): Promise<RoleApiResult<RoleView>> {
  return request(
    "/api/projects/roles/update",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectKey, role }),
    },
    parseRoleView,
    fetcher,
  );
}
