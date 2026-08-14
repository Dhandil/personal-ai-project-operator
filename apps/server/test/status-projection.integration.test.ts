import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  type Approval,
  type Decision,
  type Goal,
  type Handoff,
  type Issue,
  type Project,
  type Task,
} from "@personal-ai-operator/domain";
import { parseUtcIsoTimestamp } from "@personal-ai-operator/contracts";
import type {
  StatusReportFact,
  StatusProjectionFacts,
} from "../src/infrastructure/status/status-renderer.js";
import { renderStatusDocument } from "../src/infrastructure/status/status-renderer.js";
import {
  StatusProjection,
  statusRelativePath,
} from "../src/infrastructure/status/status-projection.js";
import { ProjectWriteQueue } from "../src/infrastructure/files/project-write-queue.js";
import { encodeGovernanceDocument } from "../src/infrastructure/files/governance-codec.js";

const timestamp = parseUtcIsoTimestamp("2026-08-14T05:00:00Z");

const project: Project = {
  name: "Status projection fixture",
  idea: "Keep the current project summary reconstructible.",
  workflow: {
    currentStage: "execution",
    stages: [
      {
        key: "execution",
        title: "Execution",
        order: 10,
        status: "in_progress",
      },
    ],
  },
};

const goal: Goal = {
  id: "GOAL-013",
  title: "Generate a truthful project snapshot",
  boundary: ["status projection"],
  risks: ["External edits must not become project facts."],
  acceptanceCriteria: ["Rebuild from domain facts"],
  proposedBy: "project-lead-agent",
  status: "in_progress",
  approval: { decidedBy: "user", approved: true, decidedAt: timestamp },
};

const task: Task = {
  id: "TASK-013",
  title: "Generate status.md",
  status: "in_progress",
  goalId: "GOAL-013",
  currentRole: "executor",
  dependencies: [],
  purpose: "Project current facts into a snapshot.",
  scope: ["status projection"],
  outputs: ["status.md"],
  acceptanceCriteria: ["Facts remain authoritative"],
  requiredFiles: [".personal-workspace/status.md"],
  onDemandFiles: [".personal-workspace/tasks/TASK-013.md"],
  associatedDecisions: [],
  allowedPaths: ["apps/server/src/infrastructure/status"],
  forbiddenPaths: [".personal-workspace/tasks/TASK-014.md"],
  run: {
    mode: "local",
    gitBranch: "goal/GOAL-001",
    worktree: ".",
    verificationCommands: ["npm run test:integration -- status-projection"],
  },
  evidence: ["status-projection.integration.test.ts"],
  customFieldDefinitions: [],
  customFields: {},
  completion: {
    output: "Snapshot renderer and reader",
    tests: ["status projection integration"],
    outstandingIssues: [],
    handoff: "TASK-014 may consume the snapshot.",
  },
};

const approval: Approval = {
  id: "TASK-013",
  revision: 1,
  status: "draft",
  createdAt: timestamp,
  updatedAt: timestamp,
  relatedObjectIds: ["GOAL-013"],
  approvalType: "short_term_goal_start",
  subjectId: "GOAL-013",
  requestedBy: "system",
  request: "Approve the status projection goal.",
  decision: null,
};

const issue: Issue = {
  id: "TASK-014",
  revision: 1,
  status: "in_progress",
  createdAt: timestamp,
  updatedAt: timestamp,
  relatedObjectIds: ["TASK-013"],
  title: "Waiting for projection output",
  description: "The next task depends on this snapshot.",
  severity: "blocker",
  impact: "task",
  affectedTaskIds: ["TASK-014"],
  affectedObjectIds: [],
  discussion: [],
  decisionIds: [],
  recoveryPlan: "Rebuild status.md from facts.",
  resolution: null,
};

const decision: Decision = {
  id: "DEC-013",
  revision: 1,
  status: "draft",
  createdAt: timestamp,
  updatedAt: timestamp,
  relatedObjectIds: ["TASK-013"],
  question: "Should the generated snapshot be editable?",
  options: ["No", "Yes"],
  proposedBy: "agent",
  sourceIssueId: "TASK-014",
  decision: null,
};

const handoff: Handoff = {
  id: "HANDOFF-013",
  revision: 1,
  status: "ready",
  createdAt: timestamp,
  updatedAt: timestamp,
  relatedObjectIds: ["GOAL-013", "TASK-013"],
  goalId: "GOAL-013",
  taskId: "TASK-013",
  fromRole: "executor",
  toRole: "project-lead",
  summary: "Snapshot is ready for the next governance task.",
  outputs: [
    {
      reference: ".personal-workspace/status.md",
      description: "Generated snapshot",
    },
  ],
  verificationEvidence: [
    {
      reference: "status-projection.integration.test.ts",
      description: "Rebuild test",
    },
  ],
  openIssueIds: ["TASK-014"],
  reportIds: ["REPORT-013"],
  executionIds: ["EXEC-013"],
};

const report: StatusReportFact = {
  id: "REPORT-013",
  status: "completed",
  title: "Audit log accepted",
  summary: "The preceding task was independently accepted.",
  relatedObjectIds: ["TASK-012"],
  updatedAt: timestamp,
};

const facts: StatusProjectionFacts = {
  project,
  goals: [goal],
  tasks: [task],
  approvals: [approval],
  issues: [issue],
  decisions: [decision],
  handoffs: [handoff],
  reports: [report],
};

async function createProjection(): Promise<
  Readonly<{
    readonly directory: string;
    readonly projection: StatusProjection;
  }>
> {
  const directory = await mkdtemp(join(tmpdir(), "personal-ai-status-"));
  return {
    directory,
    projection: new StatusProjection(directory, new ProjectWriteQueue()),
  };
}

test("status projection rebuilds the unique snapshot from facts after deletion", async () => {
  const { directory, projection } = await createProjection();
  try {
    const first = await projection.rebuild(facts, timestamp);
    assert.equal(first.ok, true);
    if (!first.ok) {
      throw new Error(first.error.message);
    }
    const statusPath = join(directory, statusRelativePath);
    const firstRaw = await readFile(statusPath, "utf8");
    assert.match(firstRaw, /document_type: status_snapshot/);
    assert.match(first.value.document.body, /TASK-013/);
    assert.match(first.value.document.body, /待用户处理/);
    assert.match(first.value.document.body, /阻塞问题/);
    assert.match(first.value.document.body, /REPORT-013/);

    await unlink(statusPath);
    const rebuilt = await projection.rebuild(facts, timestamp);
    assert.equal(rebuilt.ok, true);
    if (!rebuilt.ok) {
      throw new Error(rebuilt.error.message);
    }
    assert.equal(rebuilt.value.revision, 1);
    assert.equal(await readFile(statusPath, "utf8"), firstRaw);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("status projection ignores edited snapshot content and reflects changed facts", async () => {
  const { directory, projection } = await createProjection();
  try {
    const initial = await projection.rebuild(facts, timestamp);
    assert.equal(initial.ok, true);
    const statusPath = join(directory, statusRelativePath);
    const fake = encodeGovernanceDocument({
      frontMatter: {
        schema_version: 1,
        document_type: "status_snapshot",
        revision: 9,
        updated_at: timestamp,
      },
      body: "# Edited snapshot\nThis is not a project fact.\n",
    });
    assert.equal(fake.ok, true);
    if (!fake.ok) {
      throw new Error(fake.error.message);
    }
    await writeFile(statusPath, fake.value, "utf8");

    const changedFacts: StatusProjectionFacts = {
      ...facts,
      tasks: [{ ...task, status: "completed", title: "Rebuilt from facts" }],
      approvals: [],
      issues: [],
      decisions: [],
    };
    const rebuilt = await projection.rebuild(changedFacts, timestamp);
    assert.equal(rebuilt.ok, true);
    if (!rebuilt.ok) {
      throw new Error(rebuilt.error.message);
    }
    assert.equal(rebuilt.value.revision, 10);
    assert.doesNotMatch(rebuilt.value.document.body, /Edited snapshot/);
    assert.match(rebuilt.value.document.body, /Rebuilt from facts/);
    assert.doesNotMatch(rebuilt.value.document.body, /待用户处理/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("status renderer is deterministic regardless of fact collection order", () => {
  const first = renderStatusDocument(facts, timestamp, 1);
  const second = renderStatusDocument(
    {
      ...facts,
      goals: [...facts.goals].reverse(),
      tasks: [...facts.tasks].reverse(),
      approvals: [...facts.approvals].reverse(),
      issues: [...facts.issues].reverse(),
      decisions: [...facts.decisions].reverse(),
      handoffs: [...facts.handoffs].reverse(),
      reports: [...facts.reports].reverse(),
    },
    timestamp,
    1,
  );
  assert.deepEqual(second, first);
});

test("status reader reports deletion and reads a generated snapshot", async () => {
  const { directory, projection } = await createProjection();
  try {
    const missing = await projection.read();
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.error.code, "not_found");
    }

    const rebuilt = await projection.rebuild(facts, timestamp);
    assert.equal(rebuilt.ok, true);
    const read = await projection.read();
    assert.equal(read.ok, true);
    if (!read.ok) {
      throw new Error(read.error.message);
    }
    assert.equal(read.value.revision, 1);
    assert.equal(read.value.relativePath, statusRelativePath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
