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

import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";

import { buildApp } from "../src/app.js";
import { AuditLogRepository } from "../src/infrastructure/audit/audit-log-repository.js";
import { GitBootstrapService } from "../src/infrastructure/git/git-bootstrap.js";
import { GitProcess } from "../src/infrastructure/git/git-process.js";
import {
  ProjectInitializationService,
  type ProjectInitializationServiceOptions,
} from "../src/infrastructure/initialization/project-initialization.js";
import { ProjectInitializationPreviewService } from "../src/infrastructure/initialization/project-init-preview.js";
import { ProjectRegistryRepository } from "../src/infrastructure/registry/project-registry-repository.js";

const timestamp = parseUtcIsoTimestamp("2026-08-14T07:00:00Z");

async function createFixture(): Promise<
  Readonly<{
    readonly cleanupRoot: string;
    readonly root: string;
    readonly databasePath: string;
    readonly registryDirectory: string;
  }>
> {
  const cleanupRoot = await mkdtemp(
    join(tmpdir(), "personal-ai-project-init-"),
  );
  const root = join(cleanupRoot, "project");
  await mkdir(root);
  return {
    cleanupRoot,
    root,
    databasePath: join(cleanupRoot, "app.db"),
    registryDirectory: join(cleanupRoot, "registry"),
  };
}

function createService(
  fixture: Readonly<{
    readonly databasePath: string;
    readonly registryDirectory: string;
  }>,
): ProjectInitializationService {
  const options: ProjectInitializationServiceOptions = {
    now: () => timestamp,
    registryFactory: () =>
      new ProjectRegistryRepository({
        databasePath: fixture.databasePath,
        registryDirectory: fixture.registryDirectory,
      }),
  };
  return new ProjectInitializationService(options);
}

async function listRegisteredProjects(
  fixture: Readonly<{
    readonly databasePath: string;
    readonly registryDirectory: string;
  }>,
) {
  const repository = new ProjectRegistryRepository(fixture);
  try {
    return repository.list();
  } finally {
    repository.close();
  }
}

test("unapproved project initialization has no file, registry, or Git side effect", async () => {
  const fixture = await createFixture();
  try {
    const preview = await new ProjectInitializationPreviewService().preview({
      projectRoot: fixture.root,
      idea: "A governed project",
    });
    assert.equal(preview.ok, true);
    if (!preview.ok) {
      throw new Error(preview.error.message);
    }

    const result = await createService(fixture).execute({
      preview: preview.value,
      approval: { approved: false, approvalId: "APPROVAL-001" },
    });
    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("Unapproved initialization unexpectedly succeeded.");
    }
    assert.equal(result.error.code, "not_approved");
    assert.deepEqual(await readdir(fixture.root), []);

    const registered = await listRegisteredProjects(fixture);
    assert.equal(registered.ok, true);
    if (registered.ok) {
      assert.deepEqual(registered.value, []);
    }
    const git = await new GitBootstrapService().detect(fixture.root);
    assert.equal(git.ok, true);
    if (git.ok) {
      assert.equal(git.value.state, "no_repository");
    }
  } finally {
    await rm(fixture.cleanupRoot, { recursive: true, force: true });
  }
});

test("approved initialization creates governance files, registry, audit, and one local baseline commit", async () => {
  const fixture = await createFixture();
  try {
    const preview = await new ProjectInitializationPreviewService().preview({
      projectRoot: fixture.root,
      projectName: "Governed project",
      idea: "A governed project",
    });
    assert.equal(preview.ok, true);
    if (!preview.ok) {
      throw new Error(preview.error.message);
    }

    const result = await createService(fixture).execute({
      preview: preview.value,
      approval: { approved: true, approvalId: "APPROVAL-001" },
    });
    assert.equal(result.ok, true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    assert.equal(result.value.filesCreated.length, 16);
    assert.equal(result.value.project.name, "Governed project");
    assert.equal(result.value.git.kind, "initialized");
    assert.equal(
      result.value.git.commit?.subject,
      "chore(governance): initialize project baseline",
    );
    assert.equal(result.value.recovery.nextStep, "none");

    const project = await readFile(
      join(fixture.root, ".personal-workspace", "project.md"),
      "utf8",
    );
    assert.match(project, /name: Governed project/);
    assert.match(project, /A governed project/);

    const audit = await new AuditLogRepository(fixture.root).readAll();
    assert.equal(audit.ok, true);
    if (audit.ok) {
      assert.equal(audit.value.length, 1);
      assert.equal(audit.value[0]?.action, "project_initialization_approved");
      assert.equal(
        audit.value[0]?.details.git_action,
        "initialize_local_repository",
      );
      assert.equal(audit.value[0]?.details.approval_id, "APPROVAL-001");
    }

    const registered = await listRegisteredProjects(fixture);
    assert.equal(registered.ok, true);
    if (registered.ok) {
      assert.equal(registered.value.length, 1);
      assert.equal(registered.value[0]?.projectKey, result.value.projectKey);
    }

    const git = await new GitBootstrapService().detect(fixture.root);
    assert.equal(git.ok, true);
    if (git.ok) {
      assert.equal(git.value.state, "existing_repository");
      assert.equal(git.value.branch, "main");
      assert.equal(git.value.clean, true);
    }
    const log = await new GitProcess().run(
      ["log", "--format=%H%n%s%n%b", "-1"],
      fixture.root,
    );
    assert.equal(log.exitCode, 0);
    assert.match(
      log.stdout,
      /chore\(governance\): initialize project baseline/,
    );
    assert.match(log.stdout, /Tasks: TASK-016/);
  } finally {
    await rm(fixture.cleanupRoot, { recursive: true, force: true });
  }
});

test("initialization rejects a stale preview after an unrelated directory change", async () => {
  const fixture = await createFixture();
  try {
    const preview = await new ProjectInitializationPreviewService().preview({
      projectRoot: fixture.root,
      idea: "A governed project",
    });
    assert.equal(preview.ok, true);
    if (!preview.ok) {
      throw new Error(preview.error.message);
    }
    await writeFile(
      join(fixture.root, "README.md"),
      "changed after preview\n",
      "utf8",
    );

    const result = await createService(fixture).execute({
      preview: preview.value,
      approval: { approved: true, approvalId: "APPROVAL-001" },
    });
    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("Stale preview unexpectedly executed.");
    }
    assert.equal(result.error.code, "preview_stale");
    assert.deepEqual(await readdir(fixture.root), ["README.md"]);
    const registered = await listRegisteredProjects(fixture);
    assert.equal(registered.ok, true);
    if (registered.ok) {
      assert.deepEqual(registered.value, []);
    }
  } finally {
    await rm(fixture.cleanupRoot, { recursive: true, force: true });
  }
});

test("initialization API preserves the approval gate", async (t) => {
  const fixture = await createFixture();
  const app = buildApp({
    projectInitializationService: createService(fixture),
  });
  t.after(async () => {
    await app.close();
    await rm(fixture.cleanupRoot, { recursive: true, force: true });
  });

  const preview = await new ProjectInitializationPreviewService().preview({
    projectRoot: fixture.root,
    idea: "API project",
  });
  assert.equal(preview.ok, true);
  if (!preview.ok) {
    throw new Error(preview.error.message);
  }

  const response = await app.inject({
    method: "POST",
    url: "/api/projects/initialize",
    payload: {
      preview: preview.value,
      approval: { approved: false, approvalId: "APPROVAL-001" },
    },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "not_approved");
  assert.deepEqual(await readdir(fixture.root), []);
});
