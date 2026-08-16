import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";
import { createDefaultWorkflow } from "@personal-ai-operator/domain";

import { buildApp } from "../src/app.js";
import { GovernanceRepository } from "../src/infrastructure/files/governance-repository.js";
import { WorkflowService } from "../src/infrastructure/workflow/workflow-service.js";
import { ProjectRegistryRepository } from "../src/infrastructure/registry/project-registry-repository.js";

const timestamp = parseUtcIsoTimestamp("2026-08-14T08:00:00Z");

type Fixture = Readonly<{
  readonly cleanupRoot: string;
  readonly projectRoot: string;
  readonly databasePath: string;
  readonly registryDirectory: string;
  readonly projectKey: string;
}>;

async function createFixture(): Promise<Fixture> {
  const cleanupRoot = await mkdtemp(join(tmpdir(), "personal-ai-workflow-"));
  const projectRoot = join(cleanupRoot, "project");
  const databasePath = join(cleanupRoot, "app.db");
  const registryDirectory = join(cleanupRoot, "registry");
  await mkdir(projectRoot, { recursive: true });

  const registry = new ProjectRegistryRepository({
    databasePath,
    registryDirectory,
  });
  try {
    const registered = await registry.register({
      rootPath: projectRoot,
      name: "Workflow fixture",
      registeredAt: timestamp,
    });
    assert.equal(registered.ok, true);
    if (!registered.ok) throw new Error(registered.error.message);

    const workflow = createDefaultWorkflow();
    const governance = new GovernanceRepository(projectRoot);
    const workflowDocument = await governance.write(
      ".personal-workspace/workflow.md",
      {
        frontMatter: {
          schema_version: 1,
          document_type: "workflow",
          revision: 1,
          created_at: timestamp,
          updated_at: timestamp,
          current_stage: workflow.currentStage,
          stages: workflow.stages,
        },
        body: "# Workflow fixture\n",
      },
      null,
    );
    assert.equal(workflowDocument.ok, true);
    const artifact = await governance.write(
      ".personal-workspace/stages/01-idea/01-idea.md",
      {
        frontMatter: {
          schema_version: 1,
          document_type: "stage",
          revision: 1,
          created_at: timestamp,
          updated_at: timestamp,
          stage_key: "idea-clarification",
          title: "Idea clarification",
          order: 1,
          status: "draft",
        },
        body: "# Idea clarification\n",
      },
      null,
    );
    assert.equal(artifact.ok, true);
    return {
      cleanupRoot,
      projectRoot,
      databasePath,
      registryDirectory,
      projectKey: registered.value.projectKey,
    };
  } finally {
    registry.close();
  }
}

function service(fixture: Fixture): WorkflowService {
  return new WorkflowService({
    now: () => timestamp,
    registryFactory: () =>
      new ProjectRegistryRepository({
        databasePath: fixture.databasePath,
        registryDirectory: fixture.registryDirectory,
      }),
  });
}

test("workflow API distinguishes formal artifacts from workflow sections", async () => {
  const fixture = await createFixture();
  const app = buildApp({ workflowService: service(fixture) });
  try {
    const response = await app.inject({
      method: "GET",
      url: `/api/projects/workflow?projectKey=${fixture.projectKey}`,
    });
    assert.equal(response.statusCode, 200);
    const payload = response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.value.currentStage, "idea-clarification");
    assert.equal(payload.value.stages.length, 10);
    assert.equal(payload.value.stages[0].artifacts[0].state, "available");
    assert.equal(payload.value.stages[1].artifacts[0].state, "missing");
    assert.deepEqual(payload.value.stages[2].artifacts, []);
    assert.deepEqual(payload.value.stages[3].artifacts, []);
    assert.deepEqual(payload.value.stages[9].artifacts, []);
  } finally {
    await app.close();
    await rm(fixture.cleanupRoot, { recursive: true, force: true });
  }
});

test("agent skip proposal explains material, missing information, and risks without writing workflow", async () => {
  const fixture = await createFixture();
  const workflowPath = join(
    fixture.projectRoot,
    ".personal-workspace",
    "workflow.md",
  );
  const before = await readFile(workflowPath, "utf8");
  const workflow = service(fixture);
  try {
    const result = await workflow.proposeSkip({
      projectKey: fixture.projectKey,
      stageKey: "idea-clarification",
      explanation: {
        material: ["Project idea is explicit"],
        missing: ["No additional discovery evidence"],
        risks: ["A hidden assumption may remain"],
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error(result.error.message);
    assert.deepEqual(result.value.explanation.material, [
      "Project idea is explicit",
    ]);
    assert.match(result.value.proposal.rationale, /材料/);
    assert.equal(await readFile(workflowPath, "utf8"), before);
  } finally {
    await rm(fixture.cleanupRoot, { recursive: true, force: true });
  }
});

test("only an approved user decision records skipped status and reason", async () => {
  const fixture = await createFixture();
  const workflow = service(fixture);
  try {
    const proposal = await workflow.proposeSkip({
      projectKey: fixture.projectKey,
      stageKey: "idea-clarification",
      rationale: "材料已足够，风险可接受。",
    });
    assert.equal(proposal.ok, true);
    if (!proposal.ok) throw new Error(proposal.error.message);

    const rejected = await workflow.decideSkip({
      projectKey: fixture.projectKey,
      proposal: proposal.value.proposal,
      decision: {
        decidedBy: "user",
        approved: false,
        reason: "用户决定继续完成当前阶段。",
      },
    });
    assert.equal(rejected.ok, true);
    if (!rejected.ok) throw new Error(rejected.error.message);
    assert.equal(rejected.value.changed, false);
    assert.equal(rejected.value.workflow.stages[0]?.status, "draft");

    const approved = await workflow.decideSkip({
      projectKey: fixture.projectKey,
      proposal: proposal.value.proposal,
      decision: {
        decidedBy: "user",
        approved: true,
        reason: "用户确认材料充分，批准跳过。",
      },
    });
    assert.equal(approved.ok, true);
    if (!approved.ok) throw new Error(approved.error.message);
    assert.equal(approved.value.changed, true);
    assert.equal(approved.value.workflow.currentStage, "problem-definition");
    assert.deepEqual(approved.value.workflow.stages[0], {
      key: "idea-clarification",
      title: "想法澄清",
      order: 1,
      status: "skipped",
      skipReason: "用户确认材料充分，批准跳过。",
      artifacts: [
        {
          relativePath: ".personal-workspace/stages/01-idea/01-idea.md",
          state: "available",
        },
      ],
    });
  } finally {
    await rm(fixture.cleanupRoot, { recursive: true, force: true });
  }
});
