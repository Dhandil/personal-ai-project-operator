import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";

import { buildApp } from "../src/app.js";
import {
  GovernanceRepository,
  type GovernanceDocument,
} from "../src/infrastructure/files/governance-repository.js";
import {
  ProjectQueryService,
  ProjectStartupService,
} from "../src/infrastructure/projects/project-startup.js";
import { ProjectRegistryRepository } from "../src/infrastructure/registry/project-registry-repository.js";

const timestamp = parseUtcIsoTimestamp("2026-08-14T08:00:00Z");

type Fixture = Readonly<{
  readonly root: string;
  readonly databasePath: string;
  readonly registryDirectory: string;
}>;

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-startup-"));
  return {
    root,
    databasePath: join(root, "app.db"),
    registryDirectory: join(root, "registry"),
  };
}

function registryFactory(fixture: Fixture): () => ProjectRegistryRepository {
  return () =>
    new ProjectRegistryRepository({
      databasePath: fixture.databasePath,
      registryDirectory: fixture.registryDirectory,
    });
}

async function writeFacts(
  rootPath: string,
  name: string,
  idea: string,
  status: string,
  body = "# Status\n\n## Current task\n- Keep the project moving.\n\n## User action\n- Review the next step.\n",
): Promise<void> {
  await mkdir(rootPath, { recursive: true });
  const repository = new GovernanceRepository(rootPath);
  const documents: readonly [string, GovernanceDocument][] = [
    [
      ".personal-workspace/project.md",
      {
        frontMatter: {
          schema_version: 1,
          document_type: "project",
          revision: 1,
          name,
          idea,
        },
        body: `# ${name}\n\n${idea}\n`,
      },
    ],
    [
      ".personal-workspace/status.md",
      {
        frontMatter: {
          schema_version: 1,
          document_type: "status_snapshot",
          revision: 1,
          status,
          source: "domain_facts",
        },
        body,
      },
    ],
  ];
  for (const [relativePath, document] of documents) {
    const current = await repository.read(relativePath);
    const nextDocument: GovernanceDocument = {
      ...document,
      frontMatter: {
        ...document.frontMatter,
        revision: current.ok ? current.value.version.revision + 1 : 1,
      },
    };
    const written = await repository.write(
      relativePath,
      nextDocument,
      current.ok ? current.value.version : null,
    );
    if (!written.ok) {
      throw new Error(
        `${relativePath}: ${written.error.code} ${written.error.message}`,
      );
    }
  }
}

async function register(
  fixture: Fixture,
  rootPath: string,
  name: string,
): Promise<string> {
  const repository = new ProjectRegistryRepository({
    databasePath: fixture.databasePath,
    registryDirectory: fixture.registryDirectory,
  });
  try {
    const result = await repository.register({
      rootPath,
      name,
      registeredAt: timestamp,
    });
    assert.equal(result.ok, true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    return result.value.projectKey;
  } finally {
    repository.close();
  }
}

test("project list reads identity from registry and live status from project facts", async () => {
  const fixture = await createFixture();
  try {
    const projectRoot = join(fixture.root, "project-a");
    await writeFacts(projectRoot, "Project A", "A live project", "in_progress");
    const projectKey = await register(fixture, projectRoot, "Project A");
    const query = new ProjectQueryService({
      registryFactory: registryFactory(fixture),
    });

    const first = await query.list();
    assert.equal(first.ok, true);
    if (!first.ok) throw new Error(first.error.message);
    assert.equal(first.value.projects[0]?.projectKey, projectKey);
    assert.equal(first.value.projects[0]?.status, "in_progress");
    assert.equal(first.value.projects[0]?.state, "available");
    assert.equal(first.value.selectionState, "none");

    await writeFacts(projectRoot, "Project A", "A live project", "blocked");
    const second = await query.list();
    assert.equal(second.ok, true);
    if (!second.ok) throw new Error(second.error.message);
    assert.equal(second.value.projects[0]?.status, "blocked");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("current selection is singular and daily startup never auto-starts", async () => {
  const fixture = await createFixture();
  try {
    const firstRoot = join(fixture.root, "project-a");
    const secondRoot = join(fixture.root, "project-b");
    await writeFacts(firstRoot, "Project A", "First project", "ready");
    await writeFacts(secondRoot, "Project B", "Second project", "draft");
    const firstKey = await register(fixture, firstRoot, "Project A");
    const secondKey = await register(fixture, secondRoot, "Project B");
    const query = new ProjectQueryService({
      registryFactory: registryFactory(fixture),
    });
    const startup = new ProjectStartupService({ queryService: query });

    const beforeSelection = await startup.start();
    assert.equal(beforeSelection.ok, true);
    if (!beforeSelection.ok) throw new Error(beforeSelection.error.message);
    assert.equal(beforeSelection.value.started, false);
    assert.equal(beforeSelection.value.needsUserAction, true);
    assert.equal(beforeSelection.value.action, "select_project");

    const selectedFirst = await query.selectCurrent(firstKey);
    assert.equal(selectedFirst.ok, true);
    const selectedSecond = await query.selectCurrent(secondKey);
    assert.equal(selectedSecond.ok, true);
    if (!selectedSecond.ok) throw new Error(selectedSecond.error.message);
    assert.equal(selectedSecond.value.currentProjectKey, secondKey);
    assert.equal(
      selectedSecond.value.projects.filter((item) => item.selected).length,
      1,
    );
    assert.equal(
      selectedSecond.value.projects.find((item) => item.selected)?.projectKey,
      secondKey,
    );

    const started = await startup.start();
    assert.equal(started.ok, true);
    if (!started.ok) throw new Error(started.error.message);
    assert.equal(started.value.started, true);
    assert.equal(started.value.autoStarted, false);
    assert.equal(started.value.project?.projectKey, secondKey);
    assert.equal(started.value.currentStatus?.status, "draft");
    assert.equal(started.value.summary?.goal, "Second project");
    assert.match(
      started.value.summary?.userActionNeeded ?? "",
      /Review the next step/,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("missing project facts are reported as recovery and do not get rebuilt automatically", async () => {
  const fixture = await createFixture();
  try {
    const projectRoot = join(fixture.root, "project-missing-facts");
    const projectKey = await register(fixture, projectRoot, "Missing facts");
    const query = new ProjectQueryService({
      registryFactory: registryFactory(fixture),
    });
    const listed = await query.list();
    assert.equal(listed.ok, true);
    if (!listed.ok) throw new Error(listed.error.message);
    assert.equal(listed.value.projects[0]?.state, "needs_recovery");
    assert.equal(
      listed.value.projects[0]?.factsError?.code,
      "project_not_found",
    );

    const startup = new ProjectStartupService({ queryService: query });
    const result = await startup.start(projectKey);
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error(result.error.message);
    assert.equal(result.value.started, false);
    assert.equal(result.value.needsRecovery, true);
    assert.equal(result.value.needsUserAction, true);
    assert.equal(result.value.action, "review_project_facts");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("project list, selection, and startup are exposed through API routes", async () => {
  const fixture = await createFixture();
  try {
    const projectRoot = join(fixture.root, "project-api");
    await writeFacts(projectRoot, "API project", "API idea", "in_progress");
    const projectKey = await register(fixture, projectRoot, "API project");
    const query = new ProjectQueryService({
      registryFactory: registryFactory(fixture),
    });
    const app = buildApp({
      projectQueryService: query,
      projectStartupService: new ProjectStartupService({ queryService: query }),
    });
    try {
      const list = await app.inject({ method: "GET", url: "/api/projects" });
      assert.equal(list.statusCode, 200);
      assert.equal(list.json().value.projects[0].projectKey, projectKey);

      const select = await app.inject({
        method: "PUT",
        url: "/api/projects/current",
        payload: { projectKey },
      });
      assert.equal(select.statusCode, 200);
      assert.equal(select.json().value.currentProjectKey, projectKey);

      const startup = await app.inject({
        method: "POST",
        url: "/api/projects/startup",
        payload: {},
      });
      assert.equal(startup.statusCode, 200);
      assert.equal(startup.json().value.autoStarted, false);
      assert.equal(startup.json().value.project.projectKey, projectKey);
    } finally {
      await app.close();
    }
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
