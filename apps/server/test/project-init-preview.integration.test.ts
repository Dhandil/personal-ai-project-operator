import { strict as assert } from "node:assert";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { buildApp } from "../src/app.js";
import { ProjectInitializationPreviewService } from "../src/infrastructure/initialization/project-init-preview.js";

async function createProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), "personal-ai-init-preview-"));
}

test("project initialization preview is read-only and lists governance and Git plans", async () => {
  const root = await createProject();
  try {
    const before = await readdir(root);
    const result = await new ProjectInitializationPreviewService().preview({
      projectRoot: root,
      idea: "A governed project operator",
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    assert.equal(result.value.projectName, root.split(/[\\/]/).at(-1));
    assert.equal(result.value.plannedFiles.length, 16);
    assert.equal(result.value.plannedDirectories.length, 15);
    assert.equal(result.value.conflicts.length, 0);
    assert.equal(result.value.defaultWorkflow.length, 10);
    assert.equal(result.value.defaultRoles.length, 5);
    assert.deepEqual(result.value.defaultSettings, [
      { key: "ui.locale", value: "zh-CN" },
      { key: "summary.interval_minutes", value: "10" },
      { key: "git.default_branch", value: "main" },
    ]);
    assert.equal(result.value.git.detected.state, "no_repository");
    assert.equal(
      result.value.git.planned.action,
      "initialize_local_repository",
    );
    assert.equal(result.value.git.planned.approvalRequired, true);
    assert.deepEqual(result.value.git.planned.remoteOperations, []);
    assert.equal(result.value.writesPerformed, false);
    assert.equal(result.value.registryChanged, false);

    assert.deepEqual(await readdir(root), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("project initialization preview reports existing governance conflicts without overwriting them", async () => {
  const root = await createProject();
  try {
    await mkdir(join(root, ".personal-workspace"), { recursive: true });
    const projectFile = join(root, ".personal-workspace", "project.md");
    await writeFile(projectFile, "user-owned project content\n", "utf8");

    const result = await new ProjectInitializationPreviewService().preview({
      projectRoot: root,
      projectName: "Example",
      idea: "An idea",
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    assert.deepEqual(result.value.conflicts, [
      {
        relativePath: ".personal-workspace/project.md",
        action: "conflict",
        reason: "existing_file",
      },
    ]);
    assert.equal(
      result.value.plannedFiles.find(
        (file) => file.relativePath === ".personal-workspace/workflow.md",
      )?.action,
      "create",
    );
    assert.equal(result.value.git.detected.state, "no_repository");
    assert.equal(
      await readdir(join(root, ".personal-workspace")).then((files) =>
        files.includes("project.md"),
      ),
      true,
    );
    assert.equal(
      await readFile(projectFile, "utf8"),
      "user-owned project content\n",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("project initialization preview API is read-only and rejects an empty idea", async (t) => {
  const root = await createProject();
  const app = buildApp();
  t.after(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/projects/preview",
    payload: { projectRoot: root, idea: "Read-only preview" },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ok, true);
  assert.deepEqual(await readdir(root), []);

  const invalidResponse = await app.inject({
    method: "POST",
    url: "/api/projects/preview",
    payload: { projectRoot: root, idea: "   " },
  });
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.json(), {
    ok: false,
    error: {
      code: "invalid_idea",
      message: "Project idea cannot be empty.",
      details: [],
    },
  });
  assert.deepEqual(await readdir(root), []);
});
