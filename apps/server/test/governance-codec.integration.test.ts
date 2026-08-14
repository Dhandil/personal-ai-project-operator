import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  decodeGovernanceDocument,
  encodeGovernanceDocument,
  validateRequiredFrontMatterKeys,
} from "../src/infrastructure/files/governance-codec.js";

test("governance-codec preserves unknown YAML and Markdown through a file roundtrip", async () => {
  const directory = await mkdtemp(join(tmpdir(), "personal-ai-governance-"));
  const sourcePath = join(directory, "record.md");
  const outputPath = join(directory, "record-roundtrip.md");
  const source = [
    "---",
    "schema_version: 1",
    "id: TASK-010",
    "status: draft",
    "revision: 1",
    "created_at: 2026-08-14T00:00:00Z",
    "updated_at: 2026-08-14T00:00:00Z",
    "unknown_future_field:",
    "  owner: user",
    "  flags: [one, two]",
    "---",
    "# Governance record",
    "",
    "Body is preserved.",
    "",
  ].join("\n");

  try {
    await writeFile(sourcePath, source, "utf8");
    const decoded = decodeGovernanceDocument(
      await readFile(sourcePath),
      (frontMatter) =>
        validateRequiredFrontMatterKeys(frontMatter, [
          "schema_version",
          "id",
          "revision",
        ]),
    );
    assert.equal(decoded.ok, true);
    if (!decoded.ok) {
      throw new Error(decoded.error.message);
    }

    assert.deepEqual(decoded.value.frontMatter.unknown_future_field, {
      owner: "user",
      flags: ["one", "two"],
    });
    assert.equal(
      decoded.value.body,
      "# Governance record\n\nBody is preserved.\n",
    );

    const encoded = encodeGovernanceDocument(decoded.value);
    assert.equal(encoded.ok, true);
    if (!encoded.ok) {
      throw new Error(encoded.error.message);
    }
    await writeFile(outputPath, encoded.value, "utf8");

    const secondDecode = decodeGovernanceDocument(await readFile(outputPath));
    assert.equal(secondDecode.ok, true);
    if (secondDecode.ok) {
      assert.deepEqual(
        secondDecode.value.frontMatter,
        decoded.value.frontMatter,
      );
      assert.equal(secondDecode.value.body, decoded.value.body);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("governance-codec returns structured failures for YAML and schema errors", () => {
  const malformed = decodeGovernanceDocument("---\nid: [\n---\nbody\n");
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.equal(malformed.error.code, "invalid_yaml");
    assert.ok(malformed.error.details.length > 0);
  }

  const missing = decodeGovernanceDocument(
    "---\nid: TASK-010\n---\nbody\n",
    (frontMatter) => validateRequiredFrontMatterKeys(frontMatter, ["revision"]),
  );
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "schema_error");
    assert.deepEqual(missing.error.details, [
      "Missing required front matter key: revision.",
    ]);
  }
});
