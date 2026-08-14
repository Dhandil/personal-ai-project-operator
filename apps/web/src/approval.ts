export type ApprovalView = Readonly<{
  readonly approval: Readonly<{
    readonly approvalType: string;
    readonly subjectId: string;
    readonly status: string;
    readonly request: string;
    readonly decision: Readonly<{
      readonly outcome: string;
      readonly note: string;
    }> | null;
  }>;
  readonly approvalId: string;
  readonly operation: string | null;
  readonly subjectSnapshot: Readonly<{
    readonly revision: number;
    readonly hash: string;
  }>;
  readonly currentSnapshot: Readonly<{
    readonly revision: number;
    readonly hash: string;
  }> | null;
  readonly stale: boolean;
}>;
export type ApprovalPage = Readonly<{
  readonly projectKey: string;
  readonly approvals: readonly ApprovalView[];
}>;
export type ApprovalApiResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{
      readonly ok: false;
      readonly error: Readonly<{
        readonly code: string;
        readonly message: string;
        readonly details: readonly string[];
      }>;
    }>;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isApproval(value: unknown): value is ApprovalView {
  return (
    record(value) &&
    typeof value.approvalId === "string" &&
    record(value.approval) &&
    typeof value.approval.subjectId === "string" &&
    typeof value.approval.status === "string" &&
    record(value.subjectSnapshot) &&
    typeof value.subjectSnapshot.revision === "number" &&
    typeof value.stale === "boolean"
  );
}
export function parseApprovalsPayload(value: unknown): ApprovalPage | null {
  return record(value) &&
    typeof value.projectKey === "string" &&
    Array.isArray(value.approvals) &&
    value.approvals.every(isApproval)
    ? (value as ApprovalPage)
    : null;
}
async function request<Value>(
  input: RequestInfo | URL,
  init: RequestInit,
  parse: (value: unknown) => Value | null,
  fetcher: typeof fetch,
): Promise<ApprovalApiResult<Value>> {
  const response = await fetcher(input, init);
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !record(payload) || payload.ok !== true)
    return {
      ok: false,
      error:
        record(payload) &&
        record(payload.error) &&
        typeof payload.error.message === "string"
          ? (payload.error as ApprovalApiResult<never> extends {
              ok: false;
              error: infer E;
            }
              ? E
              : never)
          : {
              code: `http_${response.status}`,
              message: "Approval service request failed.",
              details: [],
            },
    };
  const value = parse(payload.value);
  return value === null
    ? {
        ok: false,
        error: {
          code: "invalid_response",
          message: "Approval response has an unexpected shape.",
          details: [],
        },
      }
    : { ok: true, value };
}
export function requestApprovals(
  projectKey: string,
  fetcher: typeof fetch = fetch,
): Promise<ApprovalApiResult<ApprovalPage>> {
  return request(
    `/api/projects/approvals?projectKey=${encodeURIComponent(projectKey)}`,
    {},
    parseApprovalsPayload,
    fetcher,
  );
}
