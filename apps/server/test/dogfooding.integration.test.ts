import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";

import {
  DogfoodingService,
  dogfoodingManifestPath,
  historicalDogfoodingManifestPath,
  type DogfoodingHistoricalSnapshot,
} from "../src/infrastructure/dogfooding/dogfooding-service.js";
import {
  type GovernanceDocument,
  GovernanceRepository,
} from "../src/infrastructure/files/governance-repository.js";
import { ProjectQueryService } from "../src/infrastructure/projects/project-startup.js";
import { ProjectRegistryRepository } from "../src/infrastructure/registry/project-registry-repository.js";
import { StatusProjection } from "../src/infrastructure/status/status-projection.js";

const fixedTimestamp = parseUtcIsoTimestamp("2026-08-14T12:00:00Z");

type Fixture = Readonly<{
  readonly root: string;
  readonly databasePath: string;
  readonly registryDirectory: string;
}>;

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-dogfooding-"));
  const projectRoot = join(root, "project");
  const repository = new GovernanceRepository(projectRoot);
  const documents: readonly [string, GovernanceDocument][] = [
    [
      ".personal-workspace/stages/01-idea/01-idea.md",
      {
        frontMatter: {
          schema_version: 1,
          document_type: "stage_artifact",
          stage: "01-idea",
          status: "confirmed",
          revision: 1,
        },
        body: "# Idea\n\nConfirmed.\n",
      },
    ],
    [
      ".personal-workspace/stages/03-spec/03-spec.md",
      {
        frontMatter: {
          schema_version: 1,
          document_type: "development_spec",
          stage: "03-spec",
          status: "approved",
          revision: 1,
        },
        body: "# Spec\n\nApproved.\n",
      },
    ],
    [
      ".personal-workspace/goals/GOAL-006.md",
      {
        frontMatter: {
          schema_version: 1,
          id: "GOAL-006",
          title: "V0 自举",
          status: "draft",
          revision: 1,
        },
        body: "# GOAL-006\n",
      },
    ],
    [
      ".personal-workspace/goals/GOAL-008.md",
      {
        frontMatter: {
          schema_version: 1,
          id: "GOAL-008",
          title: "Agent Runtime",
          status: "draft",
          revision: 1,
        },
        body: "# GOAL-008\n",
      },
    ],
    [
      ".personal-workspace/tasks/TASK-001.md",
      {
        frontMatter: {
          schema_version: 1,
          id: "TASK-001",
          title: "完成基础工程",
          status: "completed",
          goal_id: "GOAL-001",
          revision: 1,
        },
        body: "# TASK-001\n",
      },
    ],
    [
      ".personal-workspace/tasks/TASK-002.md",
      {
        frontMatter: {
          schema_version: 1,
          id: "TASK-002",
          title: "已暂停的历史任务",
          status: "paused",
          goal_id: "GOAL-008",
          revision: 1,
        },
        body: "# TASK-002\n",
      },
    ],
    [
      ".personal-workspace/tasks/TASK-031.md",
      {
        frontMatter: {
          schema_version: 1,
          id: "TASK-031",
          title: "使用本项目治理本项目",
          status: "ready",
          goal_id: "GOAL-006",
          revision: 1,
          unknown_field: "must-remain",
        },
        body: "# TASK-031\n",
      },
    ],
    [
      ".personal-workspace/tasks/TASK-035.md",
      {
        frontMatter: {
          schema_version: 1,
          id: "TASK-035",
          title: "保持后续任务就绪",
          status: "ready",
          goal_id: "GOAL-008",
          revision: 1,
        },
        body: "# TASK-035\n",
      },
    ],
    [
      ".personal-workspace/approvals/APPROVAL-001.md",
      {
        frontMatter: {
          schema_version: 1,
          id: "APPROVAL-001",
          title: "项目批准",
          status: "completed",
          revision: 1,
        },
        body: "# APPROVAL-001\n",
      },
    ],
    [
      ".personal-workspace/reports/REPORT-031.md",
      {
        frontMatter: {
          schema_version: 1,
          id: "REPORT-031",
          title: "V0 浏览器闭环",
          status: "completed",
          revision: 1,
        },
        body: "# REPORT-031\n",
      },
    ],
  ];
  for (const [relativePath, document] of documents) {
    const written = await repository.write(relativePath, document, null);
    assert.equal(written.ok, true);
  }
  return {
    root: projectRoot,
    databasePath: join(root, "registry.db"),
    registryDirectory: join(root, "registry"),
  };
}

test("dogfooding scan preserves source hashes, unknown fields, and current work", async () => {
  const fixture = await createFixture();
  try {
    const service = new DogfoodingService(fixture.root, {
      now: () => fixedTimestamp,
    });
    const inspected = await service.inspect();
    assert.equal(inspected.ok, true);
    if (!inspected.ok) throw new Error(inspected.error.message);
    assert.equal(inspected.value.currentSourceStage, "03-spec");
    assert.equal(inspected.value.currentGoalId, "GOAL-006");
    assert.equal(inspected.value.currentTaskId, "TASK-031");
    assert.equal(inspected.value.stages.length, 2);
    assert.equal(inspected.value.tasks.length, 4);
    assert.equal(inspected.value.reports.length, 1);
    assert.match(inspected.value.sourceManifestHash, /^[a-f0-9]{64}$/);

    const source = await new GovernanceRepository(fixture.root).read(
      ".personal-workspace/tasks/TASK-031.md",
    );
    assert.equal(source.ok, true);
    if (!source.ok) throw new Error(source.error.message);
    assert.equal(
      source.value.document.frontMatter.unknown_field,
      "must-remain",
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("dogfooding import creates V0 facts, status, views, manifest, and report", async () => {
  const fixture = await createFixture();
  try {
    const service = new DogfoodingService(fixture.root, {
      now: () => fixedTimestamp,
    });
    const imported = await service.importAndRebuild();
    assert.equal(imported.ok, true);
    if (!imported.ok) throw new Error(imported.error.message);
    assert.deepEqual(imported.value.createdFiles, [
      ".personal-workspace/project.md",
      ".personal-workspace/workflow.md",
      ".personal-workspace/status.md",
      ".personal-workspace/reports/REPORT-032.md",
    ]);
    assert.deepEqual(imported.value.rebuiltFiles, [
      ".personal-workspace/tasks/todo.md",
      "tasks/todo.md",
      dogfoodingManifestPath,
    ]);

    const repository = new GovernanceRepository(fixture.root);
    const project = await repository.read(".personal-workspace/project.md");
    const workflow = await repository.read(".personal-workspace/workflow.md");
    const status = await repository.read(".personal-workspace/status.md");
    assert.equal(project.ok, true);
    assert.equal(workflow.ok, true);
    assert.equal(status.ok, true);
    if (!project.ok || !workflow.ok || !status.ok)
      throw new Error("facts missing");
    assert.equal(project.value.document.frontMatter.document_type, "project");
    assert.equal(
      workflow.value.document.frontMatter.current_stage,
      "execution",
    );
    assert.equal(status.value.document.frontMatter.current_task, "TASK-031");
    assert.match(status.value.document.body, /GOAL-006/);
    assert.match(
      await readFile(join(fixture.root, "tasks/todo.md"), "utf8"),
      /TASK-031/,
    );
    assert.match(
      await readFile(join(fixture.root, "tasks/todo.md"), "utf8"),
      /TASK-035/,
    );
    const manifest = JSON.parse(
      await readFile(join(fixture.root, dogfoodingManifestPath), "utf8"),
    ) as {
      manifest_kind: string;
      task_id?: string;
      source_manifest_hash: string;
    };
    assert.equal(manifest.manifest_kind, "current");
    assert.equal(manifest.task_id, undefined);
    assert.equal(
      manifest.source_manifest_hash,
      imported.value.inventory.sourceManifestHash,
    );

    const registry = new ProjectRegistryRepository({
      databasePath: fixture.databasePath,
      registryDirectory: fixture.registryDirectory,
    });
    const registered = await registry.register({
      rootPath: fixture.root,
      name: "个人 AI 项目运营工具",
      registeredAt: fixedTimestamp,
    });
    assert.equal(registered.ok, true);
    registry.close();
    const listed = await new ProjectQueryService({
      registryFactory: () =>
        new ProjectRegistryRepository({
          databasePath: fixture.databasePath,
          registryDirectory: fixture.registryDirectory,
        }),
    }).list();
    assert.equal(listed.ok, true);
    if (!listed.ok) throw new Error(listed.error.message);
    assert.equal(listed.value.projects[0]?.state, "available");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("status can be deleted and rebuilt from the unchanged formal inventory", async () => {
  const fixture = await createFixture();
  try {
    const service = new DogfoodingService(fixture.root, {
      now: () => fixedTimestamp,
    });
    const first = await service.importAndRebuild();
    assert.equal(first.ok, true);
    if (!first.ok) throw new Error(first.error.message);
    const before = first.value.inventory.sourceManifestHash;
    await unlink(join(fixture.root, ".personal-workspace/status.md"));
    const rebuilt = await new DogfoodingService(fixture.root, {
      now: () => fixedTimestamp,
    }).importAndRebuild();
    assert.equal(rebuilt.ok, true);
    if (!rebuilt.ok) throw new Error(rebuilt.error.message);
    assert.equal(rebuilt.value.inventory.sourceManifestHash, before);
    const status = await new StatusProjection(fixture.root).read();
    assert.equal(status.ok, true);
    if (!status.ok) throw new Error(status.error.message);
    assert.equal(status.value.revision, 1);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("current import rebuilds an existing workflow without historical metadata", async () => {
  const fixture = await createFixture();
  try {
    const service = new DogfoodingService(fixture.root, {
      now: () => fixedTimestamp,
    });
    const first = await service.importAndRebuild();
    assert.equal(first.ok, true);
    if (!first.ok) throw new Error(first.error.message);

    const repository = new GovernanceRepository(fixture.root);
    const task = await repository.read(".personal-workspace/tasks/TASK-031.md");
    assert.equal(task.ok, true);
    if (!task.ok) throw new Error(task.error.message);
    const taskUpdated = await repository.write(
      ".personal-workspace/tasks/TASK-031.md",
      {
        frontMatter: {
          ...task.value.document.frontMatter,
          status: "completed",
          revision: task.value.version.revision + 1,
        },
        body: task.value.document.body,
      },
      task.value.version,
    );
    assert.equal(taskUpdated.ok, true);

    const second = await service.importAndRebuild();
    assert.equal(second.ok, true);
    if (!second.ok) throw new Error(second.error.message);
    assert.deepEqual(second.value.rebuiltFiles, [
      ".personal-workspace/workflow.md",
      ".personal-workspace/status.md",
      ".personal-workspace/tasks/todo.md",
      "tasks/todo.md",
      dogfoodingManifestPath,
    ]);

    const workflow = await repository.read(".personal-workspace/workflow.md");
    assert.equal(workflow.ok, true);
    if (!workflow.ok) throw new Error(workflow.error.message);
    assert.equal(workflow.value.version.revision, 2);
    assert.equal(workflow.value.document.frontMatter.snapshot_kind, undefined);
    assert.equal(
      workflow.value.document.frontMatter.current_task_id,
      undefined,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("historical TASK-031 snapshot keeps report and generated views aligned", async () => {
  const fixture = await createFixture();
  try {
    const service = new DogfoodingService(fixture.root, {
      now: () => fixedTimestamp,
    });
    const inspected = await service.inspect();
    assert.equal(inspected.ok, true);
    if (!inspected.ok) throw new Error(inspected.error.message);

    const snapshot: DogfoodingHistoricalSnapshot = {
      schema_version: 1,
      snapshot_kind: "historical_task_snapshot",
      task_id: "TASK-031",
      snapshot_boundary: "TASK-031 execution before TASK-035",
      snapshot_at: fixedTimestamp,
      snapshot_label: "TASK-031 test snapshot",
      source_manifest_hash: inspected.value.sourceManifestHash,
      current_source_stage: inspected.value.currentSourceStage,
      current_goal_id: inspected.value.currentGoalId,
      current_task_id: inspected.value.currentTaskId,
      source_files: inspected.value.sourceFiles,
    };
    const rebuilt = await service.rebuildHistoricalSnapshot(snapshot);
    assert.equal(rebuilt.ok, true);
    if (!rebuilt.ok) throw new Error(rebuilt.error.message);

    const repository = new GovernanceRepository(fixture.root);
    const paths = [
      ".personal-workspace/reports/REPORT-032.md",
      ".personal-workspace/project.md",
      ".personal-workspace/workflow.md",
      ".personal-workspace/status.md",
    ] as const;
    const documents = await Promise.all(
      paths.map((path) => repository.read(path)),
    );
    for (const document of documents) assert.equal(document.ok, true);
    if (documents.some((document) => !document.ok))
      throw new Error("historical generated documents missing");
    const [report, project, workflow, status] = documents.map(
      (document) =>
        (document as { ok: true; value: { document: GovernanceDocument } })
          .value.document,
    );
    const expectedCounts = {
      stages: 2,
      goals: 2,
      tasks: 4,
      approvals: 1,
      reports: 1,
    };
    for (const document of [report, project, workflow, status]) {
      assert.equal(document.frontMatter.current_source_stage, "03-spec");
      assert.equal(document.frontMatter.current_goal_id, "GOAL-006");
      assert.equal(document.frontMatter.current_task_id, "TASK-031");
      assert.equal(
        document.frontMatter.source_manifest_hash,
        inspected.value.sourceManifestHash,
      );
      assert.deepEqual(document.frontMatter.source_counts, expectedCounts);
      assert.equal(
        document.frontMatter.snapshot_kind,
        "historical_task_snapshot",
      );
    }

    const manifest = JSON.parse(
      await readFile(
        join(fixture.root, historicalDogfoodingManifestPath),
        "utf8",
      ),
    ) as DogfoodingHistoricalSnapshot;
    assert.equal(
      manifest.source_manifest_hash,
      report.frontMatter.source_manifest_hash,
    );
    assert.equal(manifest.current_goal_id, report.frontMatter.current_goal_id);
    assert.equal(manifest.current_task_id, report.frontMatter.current_task_id);
    assert.equal(
      manifest.source_files.length,
      inspected.value.sourceFiles.length,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
