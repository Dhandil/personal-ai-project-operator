import { strict as assert } from "node:assert";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";

import { AuditLogRepository } from "../src/infrastructure/audit/audit-log-repository.js";
import {
  GovernanceRepository,
  type FileVersion,
} from "../src/infrastructure/files/governance-repository.js";
import {
  StageArtifactService,
  type StageArtifactCandidateInput,
} from "../src/infrastructure/stages/stage-artifact-service.js";

const timestamp = parseUtcIsoTimestamp("2026-08-17T00:00:00Z");

const ideaPayload = (suffix = "") => ({
  schemaVersion: 1,
  kind: "idea_result",
  stage: "idea",
  problemStatement: `A governed project idea${suffix}.`,
  assumptions: ["The user owns the workspace."],
  openQuestions: [],
  artifactRefs: [],
  handoff: "Discovery should test this idea.",
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-stage-artifact-"));
  await mkdir(join(root, ".personal-workspace"), { recursive: true });
  const service = new StageArtifactService(root, { now: () => timestamp });
  return { root, service, repository: new GovernanceRepository(root) };
}

async function submit(
  service: StageArtifactService,
  stageRunId: string,
  payload: unknown = ideaPayload(),
  expectedCandidate: FileVersion | null = null,
) {
  const input: StageArtifactCandidateInput = {
    stageRunId,
    stage: "idea",
    payload,
    body: "# Idea candidate\n\nCandidate content.\n",
    expectedCandidate,
  };
  const result = await service.submitCandidate(input);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

async function acceptReview(
  service: StageArtifactService,
  stageRunId: string,
  candidateVersion: FileVersion,
  expectedReview: FileVersion | null = null,
) {
  const result = await service.reviewCandidate({
    stageRunId,
    stage: "idea",
    decision: "accepted",
    findings: [],
    requiredChanges: [],
    verificationEvidence: ["reviewed candidate schema"],
    expectedCandidate: candidateVersion,
    expectedReview,
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

test("keeps candidate, review and approval records separate", async () => {
  const value = await fixture();
  try {
    const candidate = await submit(value.service, "STAGE-RUN-001");
    const review = await value.service.reviewCandidate({
      stageRunId: "STAGE-RUN-001",
      stage: "idea",
      decision: "changes_requested",
      findings: ["The problem statement needs evidence."],
      requiredChanges: ["Add one user scenario."],
      verificationEvidence: ["Schema and boundary checked."],
      expectedCandidate: candidate.version,
      expectedReview: null,
    });
    assert.equal(review.ok, true);
    if (!review.ok) throw new Error(review.error.message);

    const approval = await value.service.decide({
      stageRunId: "STAGE-RUN-001",
      stage: "idea",
      decision: "changes_requested",
      note: "Return the candidate for evidence changes.",
      expectedCandidate: candidate.version,
      expectedReview: review.value.version,
      expectedFormal: null,
    });
    assert.equal(
      approval.ok,
      true,
      approval.ok ? undefined : approval.error.message,
    );
    if (!approval.ok) throw new Error(approval.error.message);
    assert.equal(approval.value.decision, "changes_requested");

    const formal = await value.service.readFormal("idea", "STAGE-RUN-001");
    assert.equal(formal.ok, true);
    if (formal.ok) assert.equal(formal.value, null);
    const candidateOnDisk = await value.service.readCandidate(
      "idea",
      "STAGE-RUN-001",
    );
    assert.equal(candidateOnDisk.ok, true);
    const approvalFiles = await readdir(
      join(value.root, ".personal-workspace", "stage-approvals"),
    );
    assert.deepEqual(approvalFiles, ["APPROVAL-001.md"]);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("writes formal facts only after user approval and preserves unknown metadata", async () => {
  const value = await fixture();
  try {
    const formalPath = ".personal-workspace/stages/01-idea/01-idea.md";
    const seeded = await value.repository.write(
      formalPath,
      {
        frontMatter: {
          schema_version: 1,
          document_type: "stage_artifact",
          artifact_status: "approved",
          stage: "idea",
          stage_run_id: "STAGE-RUN-000",
          revision: 1,
          created_at: timestamp,
          updated_at: timestamp,
          payload: ideaPayload(" baseline"),
          legacy_field: "preserve-me",
        },
        body: "# Approved baseline\n",
      },
      null,
    );
    assert.equal(seeded.ok, true);
    if (!seeded.ok) throw new Error(seeded.error.message);

    const candidate = await submit(value.service, "STAGE-RUN-001", {
      ...ideaPayload(" updated"),
      unknown_payload_field: "keep-me",
    });
    const review = await acceptReview(
      value.service,
      "STAGE-RUN-001",
      candidate.version,
    );
    const approval = await value.service.approve({
      stageRunId: "STAGE-RUN-001",
      stage: "idea",
      note: "Approved after the read-only review.",
      expectedCandidate: candidate.version,
      expectedReview: review.version,
      expectedFormal: seeded.value.version,
    });
    assert.equal(
      approval.ok,
      true,
      approval.ok ? undefined : approval.error.message,
    );
    if (!approval.ok) throw new Error(approval.error.message);
    assert.equal(approval.value.decision, "approved");
    assert.equal(approval.value.subjectSnapshot?.revision, 2);

    const formal = await value.service.readFormal("idea", "STAGE-RUN-001");
    assert.equal(formal.ok, true);
    if (!formal.ok || formal.value === null)
      throw new Error("Formal stage fact missing.");
    assert.equal(formal.value.version.revision, 2);
    assert.equal(formal.value.payload.unknown_payload_field, "keep-me");
    const stored = await readFile(join(value.root, formalPath), "utf8");
    assert.match(stored, /legacy_field: preserve-me/);
    assert.match(stored, /artifact_status: approved/);

    const statusPath = join(value.root, ".personal-workspace", "status.md");
    await writeFile(statusPath, "# Generated status\n", "utf8");
    await unlink(statusPath);
    const afterSnapshotDeletion = await value.service.readFormal(
      "idea",
      "STAGE-RUN-001",
    );
    assert.equal(afterSnapshotDeletion.ok, true);
    if (afterSnapshotDeletion.ok)
      assert.equal(afterSnapshotDeletion.value?.version.revision, 2);

    const audits = await new AuditLogRepository(value.root).readAll();
    assert.equal(audits.ok, true);
    if (audits.ok) {
      assert.ok(
        audits.value.some((event) => event.action === "stage_approved"),
      );
      assert.ok(
        audits.value.every(
          (event) =>
            event.details.stage_run_id === "STAGE-RUN-001" ||
            event.action !== "stage_approved",
        ),
      );
    }
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("blocks approval on an external formal artifact change without overwriting it", async () => {
  const value = await fixture();
  try {
    const formalPath = ".personal-workspace/stages/01-idea/01-idea.md";
    const baseline = await value.repository.write(
      formalPath,
      {
        frontMatter: {
          schema_version: 1,
          document_type: "stage_artifact",
          artifact_status: "approved",
          stage: "idea",
          stage_run_id: "STAGE-RUN-000",
          revision: 1,
          created_at: timestamp,
          updated_at: timestamp,
          payload: ideaPayload(" baseline"),
        },
        body: "# External baseline\n",
      },
      null,
    );
    assert.equal(baseline.ok, true);
    if (!baseline.ok) throw new Error(baseline.error.message);
    const candidate = await submit(value.service, "STAGE-RUN-002");
    const review = await acceptReview(
      value.service,
      "STAGE-RUN-002",
      candidate.version,
    );

    const external = await value.repository.write(
      formalPath,
      {
        frontMatter: {
          ...baseline.value.document.frontMatter,
          revision: 2,
          updated_at: timestamp,
        },
        body: "# External edit\n",
      },
      baseline.value.version,
    );
    assert.equal(external.ok, true);

    const blocked = await value.service.approve({
      stageRunId: "STAGE-RUN-002",
      stage: "idea",
      note: "Approval must stop on an external edit.",
      expectedCandidate: candidate.version,
      expectedReview: review.version,
      expectedFormal: baseline.value.version,
    });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.error.code, "conflict");
    const stored = await readFile(join(value.root, formalPath), "utf8");
    assert.match(stored, /External edit/);
    await assert.rejects(() =>
      readdir(join(value.root, ".personal-workspace", "stage-approvals")),
    );
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("rejects malformed stage candidate payload before creating a candidate file", async () => {
  const value = await fixture();
  try {
    const result = await value.service.submitCandidate({
      stageRunId: "STAGE-RUN-003",
      stage: "idea",
      payload: { schemaVersion: 1, kind: "wrong", stage: "idea" },
      body: "# Invalid\n",
      expectedCandidate: null,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "invalid_stage_artifact");
    const missing = await value.service.readCandidate("idea", "STAGE-RUN-003");
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(typeof missing.error.code, "string");
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});
