import { describe, expect, it } from "vitest";

import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";

import {
  createCustomFieldDefinition,
  validateCustomFieldValues,
} from "./custom-field.js";

describe("custom field model", () => {
  it("supports the confirmed lightweight field types", () => {
    const result = createCustomFieldDefinition({
      key: "priority",
      label: "Priority",
      type: "single_select",
      required: true,
      options: ["low", "high"],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe("single_select");
      expect(result.value.options).toEqual(["low", "high"]);
    }
  });

  it("validates required, typed, and selected values", () => {
    const definition = createCustomFieldDefinition({
      key: "due_date",
      label: "Due date",
      type: "date",
      required: true,
    });
    expect(definition.ok).toBe(true);
    if (!definition.ok) {
      throw new Error(definition.error.message);
    }

    const missing = validateCustomFieldValues([definition.value], {});
    expect(missing).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "required_field" }),
    });

    const valid = validateCustomFieldValues([definition.value], {
      due_date: parseUtcIsoTimestamp("2026-08-14T00:00:00Z"),
    });
    expect(valid.ok).toBe(true);
  });

  it("rejects options on non-select fields", () => {
    const result = createCustomFieldDefinition({
      key: "notes",
      label: "Notes",
      type: "text",
      options: ["not allowed"],
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid_custom_field" }),
    });
  });
});
