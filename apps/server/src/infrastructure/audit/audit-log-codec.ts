import {
  validateAuditEvent,
  type AuditEvent,
  type AuditEventResult,
} from "./audit-event.js";

export type AuditLogCodecErrorCode =
  | "invalid_utf8"
  | "invalid_json"
  | "empty_line"
  | "invalid_event"
  | "corrupt_tail";

export type AuditLogCodecError = Readonly<{
  readonly code: AuditLogCodecErrorCode;
  readonly message: string;
  readonly line?: number;
  readonly details: readonly string[];
}>;

export type AuditLogCodecResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: AuditLogCodecError }>;

function failure<Value>(
  code: AuditLogCodecErrorCode,
  message: string,
  details: readonly string[] = [],
  line?: number,
): AuditLogCodecResult<Value> {
  const error: AuditLogCodecError = { code, message, details };
  return {
    ok: false,
    error: line === undefined ? error : { ...error, line },
  };
}

function normalizeLineEndings(value: string): string {
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function decodeUtf8(source: string | Uint8Array): AuditLogCodecResult<string> {
  if (typeof source === "string") {
    return { ok: true, value: source };
  }

  try {
    return {
      ok: true,
      value: new TextDecoder("utf-8", { fatal: true }).decode(source),
    };
  } catch {
    return failure("invalid_utf8", "Audit log must be valid UTF-8.");
  }
}

function mapEventError<Value>(
  result: AuditEventResult<AuditEvent>,
  line: number,
): AuditLogCodecResult<Value> {
  if (result.ok) {
    return failure(
      "invalid_event",
      "Unexpected successful event validation.",
      [],
      line,
    );
  }
  return failure(
    "invalid_event",
    result.error.message,
    result.error.details,
    line,
  );
}

export function encodeAuditEvent(
  event: AuditEvent,
): AuditLogCodecResult<string> {
  const validated = validateAuditEvent(event);
  if (!validated.ok) {
    return mapEventError<string>(validated, 1);
  }

  return { ok: true, value: `${JSON.stringify(validated.value)}\n` };
}

export function encodeAuditLog(
  events: readonly AuditEvent[],
): AuditLogCodecResult<string> {
  const lines: string[] = [];
  for (const event of events) {
    const encoded = encodeAuditEvent(event);
    if (!encoded.ok) {
      return encoded;
    }
    lines.push(encoded.value.trimEnd());
  }
  return { ok: true, value: lines.length === 0 ? "" : `${lines.join("\n")}\n` };
}

export function decodeAuditLog(
  source: string | Uint8Array,
): AuditLogCodecResult<readonly AuditEvent[]> {
  const decoded = decodeUtf8(source);
  if (!decoded.ok) {
    return decoded;
  }

  const normalized = normalizeLineEndings(decoded.value);
  if (normalized === "") {
    return { ok: true, value: [] };
  }

  const lines = normalized.split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  const events: AuditEvent[] = [];
  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    if (line.trim() === "") {
      return failure(
        "empty_line",
        "Audit log contains an empty line between events.",
        [],
        lineNumber,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch (error) {
      const code: AuditLogCodecErrorCode =
        index === lines.length - 1 ? "corrupt_tail" : "invalid_json";
      return failure(
        code,
        "Audit log contains malformed JSON.",
        [error instanceof Error ? error.message : String(error)],
        lineNumber,
      );
    }

    const event = validateAuditEvent(parsed);
    if (!event.ok) {
      return mapEventError<readonly AuditEvent[]>(event, lineNumber);
    }
    events.push(event.value);
  }

  return { ok: true, value: events };
}
