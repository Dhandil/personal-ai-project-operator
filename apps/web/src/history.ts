export type HistoryEntry = Readonly<{
  readonly kind: "fact" | "generated_snapshot" | "audit_event";
  readonly id: string;
  readonly relativePath: string;
  readonly revision: number | null;
  readonly hash: string | null;
  readonly occurredAt: string;
  readonly summary: string;
}>;
export type HistoryPage = Readonly<{
  readonly projectKey: string;
  readonly entries: readonly HistoryEntry[];
}>;
export type HistoryResult =
  | Readonly<{ readonly ok: true; readonly value: HistoryPage }>
  | Readonly<{
      readonly ok: false;
      readonly error: Readonly<{ readonly message: string }>;
    }>;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function parseHistoryPayload(value: unknown): HistoryPage | null {
  return record(value) &&
    typeof value.projectKey === "string" &&
    Array.isArray(value.entries) &&
    value.entries.every(
      (entry) =>
        record(entry) &&
        ["fact", "generated_snapshot", "audit_event"].includes(
          String(entry.kind),
        ) &&
        typeof entry.id === "string" &&
        typeof entry.relativePath === "string" &&
        typeof entry.occurredAt === "string" &&
        typeof entry.summary === "string",
    )
    ? (value as HistoryPage)
    : null;
}
export async function requestHistory(
  projectKey: string,
  fetcher: typeof fetch = fetch,
): Promise<HistoryResult> {
  const response = await fetcher(
    `/api/projects/history?projectKey=${encodeURIComponent(projectKey)}`,
  );
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !record(payload) || payload.ok !== true)
    return {
      ok: false,
      error: {
        message:
          record(payload) &&
          record(payload.error) &&
          typeof payload.error.message === "string"
            ? payload.error.message
            : "History service request failed.",
      },
    };
  const value = parseHistoryPayload(payload.value);
  return value === null
    ? {
        ok: false,
        error: { message: "History response has an unexpected shape." },
      }
    : { ok: true, value };
}
