import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";

import {
  FakeAgentAdapter,
  type FakeAgentScenario,
} from "../src/infrastructure/agent-runtime/fake-agent-adapter.js";
import { ExecutionLock } from "../src/infrastructure/execution/execution-coordinator.js";
import { GovernanceRepository } from "../src/infrastructure/files/governance-repository.js";
import { PlanningDraftService } from "../src/infrastructure/planning/planning-draft-service.js";
import { ProjectRegistryRepository } from "../src/infrastructure/registry/project-registry-repository.js";
import { StageCoordinatorService } from "../src/infrastructure/stages/stage-coordinator.js";

const timestamp = parseUtcIsoTimestamp("2026-08-17T00:00:00Z");

function success(output: unknown): FakeAgentScenario {
  return { outcome: "success", output, cleanup: "success" };
}

function review() {
  return {
    decision: "accepted",
    findings: [],
    requiredChanges: [],
    verificationEvidence: ["The candidate matched its stage schema."],
  };
}

function artifact(stage: "idea" | "discovery" | "spec") {
  if (stage === "idea") {
    return {
      schemaVersion: 1,
      kind: "idea_result",
      stage,
      problemStatement: "A bounded product problem.",
      assumptions: ["The user controls the temporary project."],
      openQuestions: ["Which first workflow should be verified?"],
      artifactRefs: [],
      handoff: "Discovery should validate the problem and evidence.",
    };
  }
  if (stage === "discovery") {
    return {
      schemaVersion: 1,
      kind: "discovery_result",
      stage,
      userScenarios: ["A user reviews the proposed workflow."],
      evidence: ["A bounded temporary-project scenario."],
      risks: ["The first task must remain user-approved."],
      decisions: ["Use a separate candidate before formal writes."],
      artifactRefs: [],
      handoff: "Spec should define the bounded requirements and checks.",
    };
  }
  return {
    schemaVersion: 1,
    kind: "spec_result",
    stage,
    requirements: ["The workflow must preserve formal facts."],
    constraints: ["No formal goal or task before user approval."],
    validationPlan: ["Run the V0.3 acceptance path."],
    artifactRefs: [],
    handoff: "Planning may propose an editable implementation draft.",
  };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-v0-3-acceptance-"));
  const projectRoot = join(root, "project");
  const databasePath = join(root, "app.db");
  const registryDirectory = join(root, "registry");
  await mkdir(projectRoot, { recursive: true });

  const repository = new GovernanceRepository(projectRoot);
  const project = await repository.write(
    ".personal-workspace/project.md",
    {
      frontMatter: {
        schema_version: 1,
        document_type: "project",
        revision: 1,
        created_at: timestamp,
        updated_at: timestamp,
        name: "V0.3 temporary acceptance",
        idea: "A governed project planning flow.",
      },
      body: "# V0.3 temporary acceptance\n",
    },
    null,
  );
  assert.equal(project.ok, true);

  const registry = new ProjectRegistryRepository({
    databasePath,
    registryDirectory,
  });
  const registered = await registry.register({
    rootPath: projectRoot,
    name: "V0.3 temporary acceptance",
    registeredAt: timestamp,
  });
  registry.close();
  assert.equal(registered.ok, true);
  if (!registered.ok) throw new Error(registered.error.message);

  const runtime = new FakeAgentAdapter({
    now: () => timestamp,
    scenarios: [success(review()), success(review()), success(review())],
  });
  const coordinator = new StageCoordinatorService({
    runtime,
    now: () => timestamp,
    lock: new ExecutionLock(),
  });
  const planning = new PlanningDraftService({
    now: () => timestamp,
    registryFactory: () =>
      new ProjectRegistryRepository({ databasePath, registryDirectory }),
  });

  return {
    root,
    projectRoot,
    projectKey: registered.value.projectKey,
    coordinator,
    planning,
  };
}

test("V0.3 temporary project reaches the first approved ready task", async () => {
  const value = await fixture();
  try {
    for (const stage of ["idea", "discovery", "spec"] as const) {
      const started = await value.coordinator.start(
        { projectRoot: value.projectRoot },
        success(artifact(stage)),
      );
      assert.equal(started.ok, true, started.ok ? "" : started.error.message);
      if (!started.ok) throw new Error(started.error.message);
      assert.equal(started.value.stage, stage);
      assert.equal(started.value.run.status, "awaiting_review");

      const approved = await value.coordinator.approve({
        projectRoot: value.projectRoot,
        stageRunId: started.value.run.stageRunId,
        note: `Approve ${stage} for the temporary V0.3 acceptance.`,
      });
      assert.equal(
        approved.ok,
        true,
        approved.ok ? "" : approved.error.message,
      );
    }

    const draft = await value.planning.generate({
      projectKey: value.projectKey,
    });
    assert.equal(draft.ok, true, draft.ok ? "" : draft.error.message);
    if (!draft.ok) throw new Error(draft.error.message);
    assert.equal(draft.value.status, "candidate");
    assert.equal(draft.value.draft.specRevision, 1);

    const goalId = draft.value.draft.goalDrafts[0]?.id;
    const taskIds = draft.value.draft.taskDrafts.map((task) => task.id);
    assert.ok(goalId);
    assert.ok(taskIds.length >= 1);
    await assert.rejects(
      readFile(
        join(value.projectRoot, ".personal-workspace", "goals", `${goalId}.md`),
      ),
    );
    for (const taskId of taskIds) {
      await assert.rejects(
        readFile(
          join(
            value.projectRoot,
            ".personal-workspace",
            "tasks",
            `${taskId}.md`,
          ),
        ),
      );
    }

    const edited = await value.planning.edit({
      projectKey: value.projectKey,
      revision: draft.value.revision,
      hash: draft.value.hash,
      draft: {
        goalDrafts: [
          {
            ...draft.value.draft.goalDrafts[0],
            title: "User-approved V0.3 planning goal",
          },
        ],
      },
    });
    assert.equal(edited.ok, true, edited.ok ? "" : edited.error.message);
    if (!edited.ok) throw new Error(edited.error.message);

    const approved = await value.planning.approve({
      projectKey: value.projectKey,
      revision: edited.value.revision,
      hash: edited.value.hash,
      note: "User approved the V0.3 planning draft.",
    });
    assert.equal(approved.ok, true, approved.ok ? "" : approved.error.message);
    if (!approved.ok) throw new Error(approved.error.message);
    assert.equal(approved.value.readyTaskId, approved.value.taskIds[0]);

    const goal = await readFile(
      join(value.projectRoot, ".personal-workspace", "goals", `${goalId}.md`),
      "utf8",
    );
    assert.match(goal, /status: ready/);
    assert.match(goal, /User-approved V0\.3 planning goal/);
    const firstTask = await readFile(
      join(
        value.projectRoot,
        ".personal-workspace",
        "tasks",
        `${approved.value.readyTaskId}.md`,
      ),
      "utf8",
    );
    assert.match(firstTask, /status: ready/);
    const laterTask = approved.value.taskIds[1];
    if (laterTask !== undefined) {
      const later = await readFile(
        join(
          value.projectRoot,
          ".personal-workspace",
          "tasks",
          `${laterTask}.md`,
        ),
        "utf8",
      );
      assert.match(later, /status: draft/);
    }
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});
