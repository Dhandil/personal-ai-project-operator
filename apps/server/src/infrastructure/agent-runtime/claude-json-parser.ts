import { StringDecoder } from "node:string_decoder";

import type {
  AgentEventData,
  AgentEventType,
  AgentOutput,
} from "@personal-ai-operator/contracts";

type JsonObject = Record<string, unknown>;

export type ClaudeJsonRecord = Readonly<{
  readonly value: JsonObject;
  readonly line: number;
}>;

export type ClaudeEventProjection = Readonly<{
  readonly type: AgentEventType;
  readonly message: string;
  readonly data: AgentEventData;
  readonly sessionId: string | null;
  readonly changedFiles: readonly string[];
  readonly output: AgentOutput | null;
  readonly error: string | null;
}>;

export class ClaudeJsonParseError extends Error {
  public readonly line: number;

  public constructor(message: string, line: number) {
    super(`Claude JSON line ${line}: ${message}`);
    this.name = "ClaudeJsonParseError";
    this.line = line;
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function scalar(value: unknown): string | number | boolean | null {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;
  return JSON.stringify(value);
}

function nestedString(
  value: unknown,
  ...keys: readonly string[]
): string | null {
  let current: unknown = value;
  for (const key of keys) {
    if (!isObject(current)) return null;
    current = current[key];
  }
  return stringValue(current);
}

function sessionIdOf(record: JsonObject): string | null {
  return stringValue(record.session_id) ?? stringValue(record.sessionId);
}

function changedFilesOf(record: JsonObject): string[] {
  const paths = new Set<string>();
  const add = (value: unknown): void => {
    if (isObject(value)) {
      for (const key of ["file_path", "path", "filename"]) {
        const path = stringValue(value[key]);
        if (path !== null) paths.add(path);
      }
      const input = value.input;
      if (isObject(input)) add(input);
    }
    if (Array.isArray(value)) value.forEach(add);
  };
  add(record);
  add(record.content);
  add(record.message);
  return [...paths];
}

function outputOf(record: JsonObject): AgentOutput | null {
  const result = record.result;
  if (isObject(result)) {
    return Object.fromEntries(
      Object.entries(result).map(([key, value]) => [key, scalar(value)]),
    );
  }
  const structured = record.structured_output;
  if (isObject(structured)) {
    return Object.fromEntries(
      Object.entries(structured).map(([key, value]) => [key, scalar(value)]),
    );
  }
  const text =
    stringValue(result) ??
    stringValue(record.text) ??
    nestedString(record, "message", "content");
  return text === null ? null : { summary: text };
}

function messageOf(record: JsonObject, type: string): string {
  const nestedError =
    nestedString(record, "error", "type") ??
    nestedString(record, "error", "code") ??
    nestedString(record, "error", "message") ??
    stringValue(record.error);
  return (
    stringValue(record.message) ??
    stringValue(record.result) ??
    stringValue(record.text) ??
    nestedError ??
    `${type} event received.`
  );
}

function eventTypeOf(type: string, record: JsonObject): AgentEventType {
  if (type === "system" || type === "session.start") return "started";
  if (type === "result")
    return record.is_error === true ? "failed" : "completed";
  if (type === "error") return "error_output";
  if (type === "assistant" || type === "tool_use") return "progress";
  return "progress";
}

function dataOf(
  type: string,
  record: JsonObject,
  sessionId: string | null,
  changedFiles: readonly string[],
): AgentEventData {
  const data: Record<string, string | number | boolean | null> = {
    vendorType: type,
  };
  if (sessionId !== null) data.sessionId = sessionId;
  if (changedFiles.length > 0) data.fileChanges = JSON.stringify(changedFiles);
  for (const key of ["cost_usd", "duration_ms", "num_turns", "usage"]) {
    if (record[key] !== undefined) data[key] = scalar(record[key]);
  }
  return data;
}

export function projectClaudeRecord(
  record: ClaudeJsonRecord,
): ClaudeEventProjection {
  const type = stringValue(record.value.type);
  if (type === null)
    throw new ClaudeJsonParseError("event type is required", record.line);
  const sessionId = sessionIdOf(record.value);
  const changedFiles = changedFilesOf(record.value);
  const output = outputOf(record.value);
  const error =
    type === "error" || record.value.is_error === true
      ? messageOf(record.value, type)
      : null;
  return {
    type: eventTypeOf(type, record.value),
    message: messageOf(record.value, type),
    data: dataOf(type, record.value, sessionId, changedFiles),
    sessionId,
    changedFiles,
    output,
    error,
  };
}

export class ClaudeJsonParser {
  private readonly decoder = new StringDecoder("utf8");
  private buffer = "";
  private line = 0;

  public push(chunk: Uint8Array | string): readonly ClaudeJsonRecord[] {
    this.buffer +=
      typeof chunk === "string"
        ? chunk
        : this.decoder.write(Buffer.from(chunk));
    return this.readCompleteLines();
  }

  public finish(): readonly ClaudeJsonRecord[] {
    this.buffer += this.decoder.end();
    const records = this.readCompleteLines();
    if (this.buffer.trim().length > 0) {
      records.push(this.parseDocument(this.buffer));
      this.buffer = "";
    }
    return records;
  }

  private readCompleteLines(): ClaudeJsonRecord[] {
    const records: ClaudeJsonRecord[] = [];
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newline + 1);
      if (line.trim().length > 0) records.push(this.parseDocument(line));
      newline = this.buffer.indexOf("\n");
    }
    return records;
  }

  private parseDocument(text: string): ClaudeJsonRecord {
    this.line += 1;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new ClaudeJsonParseError("invalid JSON", this.line);
    }
    if (!isObject(value)) {
      throw new ClaudeJsonParseError("event must be a JSON object", this.line);
    }
    return { value, line: this.line };
  }
}
