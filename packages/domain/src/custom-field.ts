import {
  isUtcIsoTimestamp,
  type UtcIsoTimestamp,
} from "@personal-ai-operator/contracts";

import type { DomainError, DomainResult } from "./workflow.js";

export const customFieldTypes = [
  "text",
  "number",
  "boolean",
  "date",
  "single_select",
  "file_reference",
] as const;

export type CustomFieldType = (typeof customFieldTypes)[number];

export type FileReference = Readonly<{
  readonly path: string;
}>;

export type CustomFieldValue =
  string | number | boolean | UtcIsoTimestamp | FileReference;

export type CustomFieldValues = Readonly<Record<string, CustomFieldValue>>;

export type CustomFieldDefinition = Readonly<{
  readonly key: string;
  readonly label: string;
  readonly type: CustomFieldType;
  readonly required: boolean;
  readonly options?: readonly string[];
}>;

export type CustomFieldDefinitionInput = Readonly<{
  readonly key: string;
  readonly label: string;
  readonly type: CustomFieldType;
  readonly required?: boolean;
  readonly options?: readonly string[];
}>;

function customFieldError(message: string): DomainResult<never> {
  const error: DomainError = { code: "invalid_custom_field", message };
  return { ok: false, error };
}

function isNonEmptyText(value: string): boolean {
  return value.trim().length > 0;
}

export function createCustomFieldDefinition(
  input: CustomFieldDefinitionInput,
): DomainResult<CustomFieldDefinition> {
  if (!isNonEmptyText(input.key) || !isNonEmptyText(input.label)) {
    return customFieldError("Custom field key and label are required.");
  }

  const key = input.key.trim();
  const label = input.label.trim();
  if (input.type === "single_select") {
    const options = input.options?.map((option) => option.trim()) ?? [];
    if (
      options.length === 0 ||
      options.some((option) => option.length === 0) ||
      new Set(options).size !== options.length
    ) {
      return customFieldError(
        "Single-select custom fields require unique non-empty options.",
      );
    }

    return {
      ok: true,
      value: {
        key,
        label,
        type: input.type,
        required: input.required ?? false,
        options,
      },
    };
  }

  if (input.options !== undefined) {
    return customFieldError("Only single-select fields may define options.");
  }

  return {
    ok: true,
    value: { key, label, type: input.type, required: input.required ?? false },
  };
}

function isFileReference(value: CustomFieldValue): value is FileReference {
  return (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    typeof value.path === "string"
  );
}

function matchesType(
  definition: CustomFieldDefinition,
  value: CustomFieldValue,
): boolean {
  switch (definition.type) {
    case "text":
    case "single_select":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "date":
      return typeof value === "string" && isUtcIsoTimestamp(value);
    case "file_reference":
      return isFileReference(value);
  }
}

export function validateCustomFieldValues(
  definitions: readonly CustomFieldDefinition[],
  values: CustomFieldValues,
): DomainResult<CustomFieldValues> {
  if (
    new Set(definitions.map((definition) => definition.key)).size !==
    definitions.length
  ) {
    return customFieldError("Custom field keys must be unique.");
  }

  const definitionsByKey = new Map(
    definitions.map((definition) => [definition.key, definition]),
  );

  for (const definition of definitions) {
    const value = values[definition.key];
    if (value === undefined) {
      if (definition.required) {
        return {
          ok: false,
          error: {
            code: "required_field",
            message: `Required custom field is missing: ${definition.key}.`,
          },
        };
      }
      continue;
    }

    if (!matchesType(definition, value)) {
      return customFieldError(
        `Custom field has the wrong type: ${definition.key}.`,
      );
    }

    if (
      definition.type === "single_select" &&
      (typeof value !== "string" || !definition.options?.includes(value))
    ) {
      return customFieldError(
        `Custom field option is not allowed: ${definition.key}.`,
      );
    }
  }

  for (const key of Object.keys(values)) {
    if (definitionsByKey.has(key)) {
      continue;
    }
    if (!isNonEmptyText(key)) {
      return customFieldError("Custom field keys cannot be empty.");
    }
  }

  return { ok: true, value: { ...values } };
}
