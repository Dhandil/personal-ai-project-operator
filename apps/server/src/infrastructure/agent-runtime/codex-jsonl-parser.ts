import { StringDecoder } from "node:string_decoder";

import type {
  AgentEventData,
  AgentEventType,
  AgentOutput,
} from "@personal-ai-operator/contracts";

type JsonObject = Record<string, unknown>;

export type CodexJsonlRecord = Readonly<{
  readonly value: JsonObject;
  readonly line: number;
}>;

export type CodexEventProjection = Readonly<{
  readonly type: AgentEventType;
  readonly message: string;
  readonly data: AgentEventData;
  readonly threadId: string | null;
  readonly command: string | null;
  readonly changedFiles: readonly string[];
  readonly output: AgentOutput | null;
  readonly error: string | null;
}>;

export class CodexJsonlParseError extends Error {
  public readonly line: number;

  public constructor(message: string, line: number) {
    super(`Codex JSONL line ${line}: ${message}`);
    this.name = "CodexJsonlParseError";
    this.line = line;
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scalar(value: unknown): string | number | boolean | null {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return JSON.stringify(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
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

function recordType(record: JsonObject): string {
  const type = stringValue(record.type);
  if (type === null)
    throw new CodexJsonlParseError("event type is required", 0);
  return type;
}

function commandOf(record: JsonObject): string | null {
  return (
    stringValue(record.command) ??
    nestedString(record, "item", "command") ??
    nestedString(record, "item", "command_execution", "command")
  );
}

function changedFilesOf(record: JsonObject): string[] {
  const item = isObject(record.item) ? record.item : record;
  const changes = Array.isArray(item.changes)
    ? item.changes
    : Array.isArray(item.file_changes)
      ? item.file_changes
      : [];
  const paths = new Set<string>();
  for (const change of changes) {
    if (!isObject(change)) continue;
    for (const key of [
      "path",
      "file_path",
      "filename",
      "old_path",
      "new_path",
    ]) {
      const path = stringValue(change[key]);
      if (path !== null) paths.add(path);
    }
  }
  for (const key of ["path", "file_path", "filename"]) {
    const path = stringValue(item[key]);
    if (path !== null) paths.add(path);
  }
  return [...paths];
}

function outputOf(record: JsonObject): AgentOutput | null {
  const item = isObject(record.item) ? record.item : null;
  const candidate =
    (isObject(record.result) && record.result) ||
    (isObject(record.output) && record.output) ||
    (item !== null && isObject(item.result) && item.result) ||
    null;
  if (candidate !== null) {
    return Object.fromEntries(
      Object.entries(candidate).map(([key, value]) => [key, scalar(value)]),
    );
  }
  const text =
    stringValue(record.last_agent_message) ??
    stringValue(record.text) ??
    nestedString(record, "item", "text");
  return text === null ? null : { summary: text };
}

function messageOf(record: JsonObject, type: string): string {
  return (
    stringValue(record.message) ??
    stringValue(record.error) ??
    nestedString(record, "item", "text") ??
    `${type} event received.`
  );
}

function eventTypeOf(type: string, record: JsonObject): AgentEventType {
  if (type === "thread.started" || type === "session.started") return "started";
  if (type === "error" || type === "stderr") return "error_output";
  if (
    type === "turn.completed" ||
    type === "result" ||
    type === "session.completed"
  ) {
    return "completed";
  }
  if (type === "turn.interrupted" || type === "session.interrupted")
    return "interrupted";
  if (type === "turn.failed" || type === "session.failed") return "failed";
  if (
    type === "item.completed" &&
    nestedString(record, "item", "type") === "agent_message"
  ) {
    return "output";
  }
  return "progress";
}

function dataOf(
  type: string,
  record: JsonObject,
  threadId: string | null,
  command: string | null,
  changedFiles: readonly string[],
): AgentEventData {
  const data: Record<string, string | number | boolean | null> = {
    vendorType: type,
  };
  if (threadId !== null) data.threadId = threadId;
  if (command !== null) data.command = command;
  if (changedFiles.length > 0) data.fileChanges = JSON.stringify(changedFiles);
  if (record.usage !== undefined) data.usage = scalar(record.usage);
  return data;
}

export function projectCodexRecord(
  record: CodexJsonlRecord,
): CodexEventProjection {
  const type = recordType(record.value);
  const threadId = stringValue(record.value.thread_id);
  const command = commandOf(record.value);
  const changedFiles = changedFilesOf(record.value);
  const output = outputOf(record.value);
  const error =
    type === "error" || type === "stderr"
      ? messageOf(record.value, type)
      : null;
  return {
    type: eventTypeOf(type, record.value),
    message: messageOf(record.value, type),
    data: dataOf(type, record.value, threadId, command, changedFiles),
    threadId,
    command,
    changedFiles,
    output,
    error,
  };
}

export class CodexJsonlParser {
  private readonly decoder = new StringDecoder("utf8");
  private buffer = "";
  private line = 0;

  public push(chunk: Uint8Array | string): readonly CodexJsonlRecord[] {
    this.buffer +=
      typeof chunk === "string"
        ? chunk
        : this.decoder.write(Buffer.from(chunk));
    return this.readCompleteLines();
  }

  public finish(): readonly CodexJsonlRecord[] {
    this.buffer += this.decoder.end();
    const records = this.readCompleteLines();
    if (this.buffer.length > 0) {
      records.push(this.parseLine(this.buffer));
      this.buffer = "";
    }
    return records;
  }

  private readCompleteLines(): CodexJsonlRecord[] {
    const records: CodexJsonlRecord[] = [];
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newline + 1);
      if (line.trim().length > 0) records.push(this.parseLine(line));
      newline = this.buffer.indexOf("\n");
    }
    return records;
  }

  private parseLine(line: string): CodexJsonlRecord {
    this.line += 1;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new CodexJsonlParseError("invalid JSON", this.line);
    }
    if (!isObject(value)) {
      throw new CodexJsonlParseError("event must be a JSON object", this.line);
    }
    const type = stringValue(value.type);
    if (type === null) {
      throw new CodexJsonlParseError("event type is required", this.line);
    }
    return { value, line: this.line };
  }
}
