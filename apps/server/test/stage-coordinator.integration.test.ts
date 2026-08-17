import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";

import {
  FakeAgentAdapter,
  type FakeAgentScenario,
} from "../src/infrastructure/agent-runtime/fake-agent-adapter.js";
import { GovernanceRepository } from "../src/infrastructure/files/governance-repository.js";
import { StageCoordinatorService } from "../src/infrastructure/stages/stage-coordinator.js";

const timestamp = parseUtcIsoTimestamp("2026-08-17T00:00:00Z");

function artifact(stage: "idea" | "discovery" | "spec") {
  if (stage === "idea") {
    return {
      schemaVersion: 1,
      kind: "idea_result",
      stage,
      problemStatement: "A bounded problem.",
      assumptions: ["The user owns the workspace."],
      openQuestions: [],
      artifactRefs: [],
      handoff: "Discovery should validate the problem.",
    };
  }
  if (stage === "discovery") {
    return {
      schemaVersion: 1,
      kind: "discovery_result",
      stage,
      userScenarios: ["A user validates the problem."],
      evidence: ["A recorded user interview."],
      risks: [],
      decisions: [],
      artifactRefs: [],
      handoff: "Spec should turn the evidence into requirements.",
    };
  }
  return {
    schemaVersion: 1,
    kind: "spec_result",
    stage,
    requirements: ["The system must preserve approved facts."],
    constraints: ["No formal fact may be written before approval."],
    validationPlan: ["Run the stage contract tests."],
    artifactRefs: [],
    handoff: "Planning may propose bounded implementation work.",
  };
}

function review(decision: "accepted" | "changes_requested" = "accepted") {
  return {
    decision,
    findings: decision === "accepted" ? [] : ["The handoff needs evidence."],
    requiredChanges:
      decision === "accepted" ? [] : ["Add one concrete evidence item."],
    verificationEvidence: ["The candidate was checked against its schema."],
  };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-stage-coordinator-"));
  await mkdir(join(root, ".personal-workspace"), { recursive: true });
  const repository = new GovernanceRepository(root);
  const written = await repository.write(
    ".personal-workspace/project.md",
    {
      frontMatter: {
        schema_version: 1,
        document_type: "project",
        revision: 1,
        created_at: timestamp,
        updated_at: timestamp,
        name: "Coordinator fixture",
        idea: "Coordinate a governed preflight.",
      },
      body: "# Coordinator fixture\n",
    },
    null,
  );
  assert.equal(written.ok, true);
  return root;
}

function successScenario(output: unknown): FakeAgentScenario {
  return { outcome: "success", output, cleanup: "success" };
}

test("coordinates Idea, Discovery and Spec in order with explicit approval gates", async () => {
  const root = await fixture();
  try {
    const runtime = new FakeAgentAdapter({
      now: () => timestamp,
      scenarios: [
        successScenario(review()),
        successScenario(review()),
        successScenario(review()),
      ],
    });
    const service = new StageCoordinatorService({
      runtime,
      now: () => timestamp,
    });

    const idea = await service.start(
      { projectRoot: root },
      successScenario(artifact("idea")),
    );
    assert.equal(idea.ok, true);
    if (!idea.ok) throw new Error(idea.error.message);
    assert.equal(idea.value.stage, "idea");
    assert.equal(idea.value.run.status, "awaiting_review");
    assert.equal(idea.value.approvalRequired, true);
    assert.equal(idea.value.taskPackage.role, "reviewer");
    assert.equal(idea.value.taskPackage.permissions.mode, "read_only");
    assert.deepEqual(idea.value.taskPackage.roleTemplate.allowedWritePaths, []);

    const ideaApproval = await service.approve({
      projectRoot: root,
      stageRunId: idea.value.run.stageRunId,
      note: "Approve the Idea handoff.",
    });
    assert.equal(ideaApproval.ok, true);

    const discovery = await service.start(
      { projectRoot: root },
      successScenario(artifact("discovery")),
    );
    assert.equal(
      discovery.ok,
      true,
      discovery.ok ? "" : JSON.stringify(discovery.error),
    );
    if (!discovery.ok) throw new Error(discovery.error.message);
    assert.equal(discovery.value.stage, "discovery");
    assert.equal(discovery.value.run.status, "awaiting_review");
    assert.equal(discovery.value.taskPackage.approvedArtifacts.length, 1);
    const discoveryApproval = await service.approve({
      projectRoot: root,
      stageRunId: discovery.value.run.stageRunId,
      note: "Approve the Discovery handoff.",
    });
    assert.equal(discoveryApproval.ok, true);

    const spec = await service.start(
      { projectRoot: root },
      successScenario(artifact("spec")),
    );
    assert.equal(spec.ok, true);
    if (!spec.ok) throw new Error(spec.error.message);
    assert.equal(spec.value.stage, "spec");
    assert.equal(spec.value.run.status, "awaiting_review");
    assert.equal(spec.value.taskPackage.approvedArtifacts.length, 2);
    const specApproval = await service.approve({
      projectRoot: root,
      stageRunId: spec.value.run.stageRunId,
      note: "Approve the Spec handoff.",
    });
    assert.equal(specApproval.ok, true);

    const state = await service.state({ projectRoot: root });
    assert.equal(state.ok, true);
    if (!state.ok) throw new Error(state.error.message);
    assert.deepEqual(
      state.value.runs.map((run) => [run.stage, run.status]),
      [
        ["idea", "approved"],
        ["discovery", "approved"],
        ["spec", "approved"],
      ],
    );
    for (const path of [
      ".personal-workspace/stages/01-idea/01-idea.md",
      ".personal-workspace/stages/02-discovery/02-discovery.md",
      ".personal-workspace/stages/03-spec/03-spec.md",
    ]) {
      assert.match(
        await readFile(join(root, path), "utf8"),
        /schema_version: 1/,
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("keeps rejected review in rework and retries the original stage role", async () => {
  const root = await fixture();
  try {
    const runtime = new FakeAgentAdapter({
      now: () => timestamp,
      scenarios: [
        successScenario(review("changes_requested")),
        successScenario(artifact("idea")),
        successScenario(review()),
      ],
    });
    const service = new StageCoordinatorService({
      runtime,
      now: () => timestamp,
    });
    const first = await service.start(
      { projectRoot: root },
      successScenario(artifact("idea")),
    );
    assert.equal(first.ok, true);
    if (!first.ok) throw new Error(first.error.message);
    assert.equal(first.value.run.status, "changes_requested");
    const retried = await service.retry({
      projectRoot: root,
      stageRunId: first.value.run.stageRunId,
    });
    assert.equal(
      retried.ok,
      true,
      retried.ok ? "" : JSON.stringify(retried.error),
    );
    if (!retried.ok) throw new Error(retried.error.message);
    assert.equal(retried.value.run.status, "awaiting_review");
    assert.equal(retried.value.taskPackage.role, "reviewer");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("blocks invalid output, persists recovery, and resumes with the exact session", async () => {
  const root = await fixture();
  try {
    const runtime = new FakeAgentAdapter({
      now: () => timestamp,
      scenarios: [successScenario(artifact("idea")), successScenario(review())],
      defaultScenario: {
        outcome: "interrupted",
        resumeOutcome: "success",
        output: artifact("idea"),
      },
    });
    const service = new StageCoordinatorService({
      runtime,
      now: () => timestamp,
    });
    const invalid = await service.start(
      { projectRoot: root },
      successScenario({ schemaVersion: 1, kind: "wrong", stage: "idea" }),
    );
    assert.equal(invalid.ok, false);
    if (invalid.ok) throw new Error("invalid output unexpectedly succeeded");
    assert.equal(invalid.error.code, "invalid_output");

    const retry = await service.retry({
      projectRoot: root,
      stageRunId: "STAGE-RUN-001",
    });
    assert.equal(retry.ok, true);
    if (!retry.ok) throw new Error(retry.error.message);
    assert.equal(retry.value.run.status, "awaiting_review");

    const interruptedRoot = await fixture();
    try {
      const interruptedRuntime = new FakeAgentAdapter({
        now: () => timestamp,
        defaultScenario: {
          outcome: "interrupted",
          resumeOutcome: "success",
          output: artifact("idea"),
        },
        scenarios: [successScenario(review())],
      });
      const interruptedService = new StageCoordinatorService({
        runtime: interruptedRuntime,
        now: () => timestamp,
      });
      const interrupted = await interruptedService.start(
        { projectRoot: interruptedRoot },
        {
          outcome: "interrupted",
          resumeOutcome: "success",
          output: artifact("idea"),
        },
      );
      assert.equal(interrupted.ok, true);
      if (!interrupted.ok) throw new Error(interrupted.error.message);
      assert.equal(interrupted.value.run.status, "blocked");
      assert.equal(interrupted.value.run.sessionId, "fake-session-EXEC-001");
      const restarted = new StageCoordinatorService({
        runtime: interruptedRuntime,
        now: () => timestamp,
      });
      const resumed = await restarted.resume({
        projectRoot: interruptedRoot,
        executionId: interrupted.value.run.executionId ?? undefined,
      });
      assert.equal(
        resumed.ok,
        true,
        resumed.ok ? "" : JSON.stringify(resumed.error),
      );
      if (!resumed.ok) throw new Error(resumed.error.message);
      assert.equal(resumed.value.run.status, "awaiting_review");
    } finally {
      await rm(interruptedRoot, { recursive: true, force: true });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cleanup failure blocks progress and records a recoverable result", async () => {
  const root = await fixture();
  try {
    const runtime = new FakeAgentAdapter({ now: () => timestamp });
    const service = new StageCoordinatorService({
      runtime,
      now: () => timestamp,
    });
    const result = await service.start(
      { projectRoot: root },
      { outcome: "success", output: artifact("idea"), cleanup: "failure" },
    );
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("cleanup failure unexpectedly succeeded");
    assert.equal(result.error.code, "cleanup_failed");
    const state = await service.state({ projectRoot: root });
    assert.equal(state.ok, true);
    if (state.ok) assert.equal(state.value.currentRun?.status, "blocked");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
