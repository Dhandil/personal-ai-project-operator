import type { JsonFetcher } from "./project-initialization";

export type ExecutionReport = Readonly<{
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly summary: string;
  readonly relatedObjectIds: readonly string[];
  readonly evidence: readonly Readonly<{
    readonly source: string;
    readonly eventId: string;
    readonly action: string;
  }>[];
  readonly occurredAt: string;
}>;
export type ReportPage = Readonly<{
  readonly projectKey: string;
  readonly reports: readonly ExecutionReport[];
}>;
export type SummarySettings = Readonly<{
  readonly projectKey: string;
  readonly intervalMinutes: number;
  readonly source: string;
}>;
export type ReportEvent = Readonly<{
  readonly id: string;
  readonly event: string;
  readonly data: ExecutionReport;
}>;
export type ReportApiError = Readonly<{
  readonly code: string;
  readonly message: string;
  readonly details: readonly string[];
}>;
export type ReportApiResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: ReportApiError }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isReport(value: unknown): value is ExecutionReport {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.kind === "string" &&
    typeof value.title === "string" &&
    typeof value.summary === "string" &&
    Array.isArray(value.relatedObjectIds) &&
    Array.isArray(value.evidence) &&
    typeof value.occurredAt === "string"
  );
}
export function parseReportPage(value: unknown): ReportPage | null {
  return isRecord(value) &&
    typeof value.projectKey === "string" &&
    Array.isArray(value.reports) &&
    value.reports.every(isReport)
    ? (value as ReportPage)
    : null;
}
function parseSettings(value: unknown): SummarySettings | null {
  return isRecord(value) &&
    typeof value.projectKey === "string" &&
    typeof value.intervalMinutes === "number" &&
    typeof value.source === "string"
    ? (value as SummarySettings)
    : null;
}
async function json(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
function error(value: unknown, status: number): ReportApiError {
  return isRecord(value) &&
    isRecord(value.error) &&
    typeof value.error.code === "string" &&
    typeof value.error.message === "string" &&
    Array.isArray(value.error.details)
    ? (value.error as ReportApiError)
    : {
        code: `http_${status}`,
        message: "The report service returned an invalid response.",
        details: [],
      };
}
async function request<Value>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  parse: (value: unknown) => Value | null,
  fetcher: JsonFetcher,
): Promise<ReportApiResult<Value>> {
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
            message: "The report response has an unexpected shape.",
            details: [],
          },
        }
      : { ok: true, value };
  } catch (caught: unknown) {
    return {
      ok: false,
      error: {
        code: "network_error",
        message: "Unable to reach the report service.",
        details: [caught instanceof Error ? caught.message : String(caught)],
      },
    };
  }
}
export function requestReports(
  projectKey: string,
  fetcher: JsonFetcher = fetch,
): Promise<ReportApiResult<ReportPage>> {
  return request(
    `/api/projects/reports?projectKey=${encodeURIComponent(projectKey)}`,
    undefined,
    parseReportPage,
    fetcher,
  );
}
export function requestSummarySettings(
  projectKey: string,
  fetcher: JsonFetcher = fetch,
): Promise<ReportApiResult<SummarySettings>> {
  return request(
    `/api/projects/settings?projectKey=${encodeURIComponent(projectKey)}`,
    undefined,
    parseSettings,
    fetcher,
  );
}
export function updateSummarySettings(
  input: Readonly<{
    readonly projectKey: string;
    readonly intervalMinutes: number;
  }>,
  fetcher: JsonFetcher = fetch,
): Promise<ReportApiResult<SummarySettings>> {
  return request(
    "/api/projects/settings",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    parseSettings,
    fetcher,
  );
}
export function subscribeToProjectEvents(
  projectKey: string,
  onEvent: (event: ReportEvent) => void,
  lastEventId: string | null = null,
): EventSource {
  const query = `/api/projects/events?projectKey=${encodeURIComponent(projectKey)}${lastEventId === null ? "" : `&lastEventId=${encodeURIComponent(lastEventId)}`}`;
  const source = new EventSource(query);
  const handleMessage = (message: MessageEvent<string>): void => {
    try {
      const data = JSON.parse(message.data) as unknown;
      if (isReport(data))
        onEvent({ id: message.lastEventId, event: "report", data });
    } catch {
      /* malformed events stay out of the fact view */
    }
  };
  source.onmessage = handleMessage;
  source.addEventListener("report", handleMessage);
  return source;
}
