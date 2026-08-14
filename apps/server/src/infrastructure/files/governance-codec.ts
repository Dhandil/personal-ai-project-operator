import { parseDocument, stringify, type Document as YamlDocument } from "yaml";

export type FrontMatterRecord = Readonly<Record<string, unknown>>;

export type GovernanceDocument = Readonly<{
  readonly frontMatter: FrontMatterRecord;
  readonly body: string;
}>;

export type GovernanceCodecErrorCode =
  | "invalid_utf8"
  | "missing_front_matter"
  | "invalid_yaml"
  | "invalid_document"
  | "schema_error";

export type GovernanceCodecError = Readonly<{
  readonly code: GovernanceCodecErrorCode;
  readonly message: string;
  readonly details: readonly string[];
}>;

export type GovernanceCodecResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: GovernanceCodecError }>;

export type FrontMatterValidator = (
  frontMatter: FrontMatterRecord,
) => readonly string[];

function failure<Value>(
  code: GovernanceCodecErrorCode,
  message: string,
  details: readonly string[] = [],
): GovernanceCodecResult<Value> {
  return { ok: false, error: { code, message, details } };
}

function normalizeLineEndings(value: string): string {
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function decodeUtf8(
  source: string | Uint8Array,
): GovernanceCodecResult<string> {
  if (typeof source === "string") {
    return { ok: true, value: source };
  }

  try {
    return {
      ok: true,
      value: new TextDecoder("utf-8", { fatal: true }).decode(source),
    };
  } catch {
    return failure("invalid_utf8", "Governance document must be valid UTF-8.");
  }
}

function isFrontMatterRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function splitFrontMatter(
  source: string,
): GovernanceCodecResult<Readonly<{ yaml: string; body: string }>> {
  const lines = normalizeLineEndings(source).split("\n");
  if (lines[0] !== "---") {
    return failure(
      "missing_front_matter",
      "Governance document must start with a YAML front matter delimiter.",
    );
  }

  const closingIndex = lines.findIndex(
    (line, index) => index > 0 && line === "---",
  );
  if (closingIndex < 0) {
    return failure(
      "missing_front_matter",
      "Governance document is missing the closing front matter delimiter.",
    );
  }

  return {
    ok: true,
    value: {
      yaml: lines.slice(1, closingIndex).join("\n"),
      body: lines.slice(closingIndex + 1).join("\n"),
    },
  };
}

function yamlErrors(document: YamlDocument): readonly string[] {
  return document.errors.map((error) => error.message);
}

export function validateRequiredFrontMatterKeys(
  frontMatter: FrontMatterRecord,
  requiredKeys: readonly string[],
): readonly string[] {
  return requiredKeys
    .filter((key) => !(key in frontMatter))
    .map((key) => `Missing required front matter key: ${key}.`);
}

export function decodeGovernanceDocument(
  source: string | Uint8Array,
  validate?: FrontMatterValidator,
): GovernanceCodecResult<GovernanceDocument> {
  const decoded = decodeUtf8(source);
  if (!decoded.ok) {
    return decoded;
  }

  const sections = splitFrontMatter(decoded.value);
  if (!sections.ok) {
    return sections;
  }

  let document: YamlDocument;
  try {
    document = parseDocument(sections.value.yaml, { uniqueKeys: true });
  } catch (error) {
    return failure("invalid_yaml", "YAML front matter could not be parsed.", [
      error instanceof Error ? error.message : String(error),
    ]);
  }

  if (document.errors.length > 0) {
    return failure(
      "invalid_yaml",
      "YAML front matter contains syntax errors.",
      yamlErrors(document),
    );
  }

  const parsed = document.toJS({ mapAsMap: false });
  if (!isFrontMatterRecord(parsed)) {
    return failure(
      "invalid_document",
      "YAML front matter must contain a mapping at the document root.",
    );
  }

  const frontMatter: FrontMatterRecord = { ...parsed };
  const schemaErrors = validate?.(frontMatter) ?? [];
  if (schemaErrors.length > 0) {
    return failure(
      "schema_error",
      "Front matter does not satisfy its schema.",
      schemaErrors,
    );
  }

  return {
    ok: true,
    value: { frontMatter, body: sections.value.body },
  };
}

export function encodeGovernanceDocument(
  document: GovernanceDocument,
): GovernanceCodecResult<string> {
  try {
    const yaml = stringify(document.frontMatter, { lineWidth: 0 }).trimEnd();
    const body = normalizeLineEndings(document.body);
    const normalizedBody =
      body.length === 0 || body.endsWith("\n") ? body : `${body}\n`;
    return { ok: true, value: `---\n${yaml}\n---\n${normalizedBody}` };
  } catch (error) {
    return failure(
      "invalid_document",
      "Governance document could not be encoded.",
      [error instanceof Error ? error.message : String(error)],
    );
  }
}
