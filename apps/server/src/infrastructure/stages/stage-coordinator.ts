import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  AgentEvent,
  AgentResult,
  AgentRuntime,
  AgentSession,
  AgentStartRequest,
  ExecutionId,
  TaskId,
  UtcIsoTimestamp,
} from "@personal-ai-operator/contracts";
import { parseFormalId } from "@personal-ai-operator/contracts";
import {
  createStageRun,
  createStageTaskPackage,
  stageArtifactRelativePath,
  transitionStageRun,
  type StageArtifactPayload,
  type StageArtifactReference,
  type StageApprovalReference,
  type StageRun,
  type StageRunStatus,
  type StageTaskPackage,
  type StageTaskPackageRole,
  validateStageArtifactPayload,
  validateStageReview,
  type StageReviewDecision,
} from "@personal-ai-operator/domain";

import { createAuditEvent } from "../audit/audit-event.js";
import { AuditLogRepository } from "../audit/audit-log-repository.js";
import {
  FakeAgentAdapter,
  type FakeAgentScenario,
} from "../agent-runtime/fake-agent-adapter.js";
import { ExecutionLock } from "../execution/execution-coordinator.js";
import {
  GovernanceRepository,
  type FileVersion,
  type GovernanceSnapshot,
} from "../files/governance-repository.js";
import type { GovernanceDocument } from "../files/governance-codec.js";
import { ProjectRegistryRepository } from "../registry/project-registry-repository.js";
import { StageArtifactService } from "./stage-artifact-service.js";

export const coordinatedStages = ["idea", "discovery", "spec"] as const;
export type CoordinatedStage = (typeof coordinatedStages)[number];

const STAGE_ORDER: readonly CoordinatedStage[] = coordinatedStages;
const STAGE_RUN_DIRECTORY = ".personal-workspace/stage-runs";
const STAGE_RUN_KEYS: Readonly<Record<CoordinatedStage, StageRun["stageKey"]>> =
  {
    idea: "idea-clarification",
    discovery: "discovery-validation",
    spec: "product-requirements",
  };
const STAGE_RUN_ROLES: Readonly<
  Record<CoordinatedStage, StageRun["currentRole"]>
> = {
  idea: "product-requirements",
  discovery: "product-requirements",
  spec: "architect",
};
const STAGE_ROLES: Readonly<Record<CoordinatedStage, StageTaskPackageRole>> = {
  idea: "idea",
  discovery: "discovery",
  spec: "spec",
};
const RUNTIME_TASK_IDS: Readonly<Record<CoordinatedStage, TaskId>> = {
  idea: "TASK-901" as TaskId,
  discovery: "TASK-902" as TaskId,
  spec: "TASK-903" as TaskId,
};
type Version = FileVersion | null;

type StoredStageRun = Readonly<{
  readonly stageRun: StageRun;
  readonly stage: CoordinatedStage;
  readonly projectRoot: string;
  readonly projectIdea: string;
  readonly executionId: ExecutionId | null;
  readonly sessionId: string | null;
  readonly phase: "producer" | "reviewer" | null;
  readonly candidateVersion: Version;
  readonly reviewVersion: Version;
  readonly reviewDecision: StageReviewDecision | null;
  readonly version: FileVersion;
  readonly relativePath: string;
  readonly document: GovernanceDocument | null;
}>;

function approvedArtifactRefs(
  records: readonly StoredStageRun[],
): readonly StageArtifactReference[] {
  const seen = new Set<string>();
  const result: StageArtifactReference[] = [];
  for (const record of records) {
    if (record.stageRun.status !== "approved") continue;
    for (const reference of record.stageRun.artifactRefs) {
      if (reference.kind !== "approved" || seen.has(reference.path)) continue;
      seen.add(reference.path);
      result.push({ ...reference });
    }
  }
  return result;
}

type MutableStoredStageRun = {
  stageRun: StageRun;
  stage: CoordinatedStage;
  projectRoot: string;
  projectIdea: string;
  executionId: ExecutionId | null;
  sessionId: string | null;
  phase: "producer" | "reviewer" | null;
  candidateVersion: Version;
  reviewVersion: Version;
  reviewDecision: StageReviewDecision | null;
  version: FileVersion;
  relativePath: string;
  document: GovernanceDocument | null;
};

type ActiveExecution = {
  readonly executionId: ExecutionId;
  readonly stageRunId: string;
  readonly phase: "producer" | "reviewer";
  readonly session: AgentSession;
  readonly request: AgentStartRequest;
  readonly lockToken: string;
  completion: Promise<StageCoordinatorResult<StageCoordinatorValue>>;
} & { cancelRequested: boolean };

export type StageCoordinatorRun = Readonly<{
  readonly stageRunId: string;
  readonly stage: CoordinatedStage;
  readonly status: StageRunStatus;
  readonly currentRole: StageRun["currentRole"];
  readonly attempt: number;
  readonly executionId: ExecutionId | null;
  readonly sessionId: string | null;
  readonly phase: "producer" | "reviewer" | null;
  readonly candidateVersion: Version;
  readonly reviewVersion: Version;
  readonly reviewDecision: StageReviewDecision | null;
  readonly artifactRefs: readonly StageArtifactReference[];
  readonly approvalRef: StageApprovalReference | null;
  readonly statusReason: string | null;
  readonly revision: number;
  readonly hash: string;
}>;

export type StageCoordinatorState = Readonly<{
  readonly projectRoot: string;
  readonly active: boolean;
  readonly currentStage: CoordinatedStage | null;
  readonly currentRun: StageCoordinatorRun | null;
  readonly runs: readonly StageCoordinatorRun[];
  readonly recoveryRequired: boolean;
  readonly approvalRequired: boolean;
}>;

export type StageCoordinatorValue = Readonly<{
  readonly projectRoot: string;
  readonly stage: CoordinatedStage;
  readonly run: StageCoordinatorRun;
  readonly taskPackage: StageTaskPackage;
  readonly events: readonly AgentEvent[];
  readonly result: AgentResult | null;
  readonly candidate: Readonly<{
    readonly revision: number;
    readonly hash: string;
  }> | null;
  readonly review: Readonly<{
    readonly revision: number;
    readonly hash: string;
    readonly decision: StageReviewDecision;
  }> | null;
  readonly approvalRequired: boolean;
}>;

export type StageCoordinatorControlValue = Readonly<{
  readonly projectRoot: string;
  readonly run: StageCoordinatorRun;
  readonly state: StageCoordinatorState;
}>;

export type StageCoordinatorErrorCode =
  | "invalid_input"
  | "project_not_found"
  | "project_facts_invalid"
  | "stage_not_ready"
  | "stage_order_invalid"
  | "execution_active"
  | "execution_not_found"
  | "recovery_required"
  | "approval_required"
  | "not_resumable"
  | "runtime_failed"
  | "invalid_output"
  | "transition_failed"
  | "conflict"
  | "persistence_failed"
  | "audit_failed"
  | "cleanup_failed";

export type StageCoordinatorError = Readonly<{
  readonly code: StageCoordinatorErrorCode;
  readonly message: string;
  readonly details: readonly string[];
}>;

export type StageCoordinatorResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: StageCoordinatorError }>;

export type StageCoordinatorStartInput = Readonly<{
  readonly projectRoot?: string;
  readonly projectKey?: string;
  readonly prompt?: string;
}>;

export type StageCoordinatorControlInput = Readonly<{
  readonly projectRoot?: string;
  readonly projectKey?: string;
  readonly executionId?: ExecutionId;
  readonly stageRunId?: string;
  readonly note?: string;
}>;

export type StageCoordinatorDecisionInput = Readonly<{
  readonly projectRoot?: string;
  readonly projectKey?: string;
  readonly stageRunId: string;
  readonly decision: "approved" | "changes_requested" | "cancelled";
  readonly note: string;
}>;

export type StageCoordinatorOptions = Readonly<{
  readonly runtime?: AgentRuntime;
  readonly lock?: ExecutionLock;
  readonly now?: () => UtcIsoTimestamp;
  readonly registryFactory?: () => ProjectRegistryRepository;
  readonly artifactServiceFactory?: (root: string) => StageArtifactService;
}>;

function failure<Value>(
  code: StageCoordinatorErrorCode,
  message: string,
  details: readonly string[] = [],
): StageCoordinatorResult<Value> {
  return { ok: false, error: { code, message, details } };
}

function nowUtc(): UtcIsoTimestamp {
  return new Date().toISOString() as UtcIsoTimestamp;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stage(value: unknown): value is CoordinatedStage {
  return (
    typeof value === "string" &&
    coordinatedStages.includes(value as CoordinatedStage)
  );
}

function executionId(value: unknown): value is ExecutionId {
  return typeof value === "string" && /^EXEC-(?!000)\d{3}$/.test(value);
}

function version(value: unknown): FileVersion | null {
  if (
    !isRecord(value) ||
    !Number.isInteger(value.revision) ||
    !nonEmpty(value.hash)
  )
    return null;
  return { revision: value.revision as number, hash: value.hash };
}

function versionValue(value: unknown): Version {
  return value === null || value === undefined ? null : version(value);
}

function stageRunId(value: unknown): string | null {
  return typeof value === "string" && /^STAGE-RUN-(?!000)\d{3}$/.test(value)
    ? value
    : null;
}

function stageRunStatus(value: unknown): value is StageRunStatus {
  return [
    "pending",
    "running",
    "awaiting_review",
    "changes_requested",
    "approved",
    "blocked",
    "cancelled",
    "recovering",
  ].includes(value as StageRunStatus);
}

function stageRunPath(id: string): string {
  return `${STAGE_RUN_DIRECTORY}/${id}.md`;
}

function stageIndex(value: CoordinatedStage): number {
  return STAGE_ORDER.indexOf(value);
}

function stageRole(stageValue: CoordinatedStage): StageTaskPackageRole {
  return STAGE_ROLES[stageValue];
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function stagePayload(
  stageValue: CoordinatedStage,
  output: AgentResult["output"],
): StageArtifactPayload | null {
  if (output === null || !isRecord(output)) return null;
  const raw = output as Record<string, unknown>;
  const explicit = parseJsonValue(raw.payload);
  const source = isRecord(explicit) ? explicit : { ...raw };
  const fields =
    stageValue === "idea"
      ? ["assumptions", "openQuestions", "artifactRefs"]
      : stageValue === "discovery"
        ? ["userScenarios", "evidence", "risks", "decisions", "artifactRefs"]
        : ["requirements", "constraints", "validationPlan", "artifactRefs"];
  const normalized: Record<string, unknown> = { ...source };
  for (const field of fields)
    normalized[field] = parseJsonValue(normalized[field]);
  if (typeof normalized.schemaVersion === "string") {
    const parsed = Number(normalized.schemaVersion);
    if (Number.isInteger(parsed)) normalized.schemaVersion = parsed;
  }
  return normalized;
}

function stageReviewInput(
  stageValue: CoordinatedStage,
  runId: string,
  output: AgentResult["output"],
): Parameters<typeof validateStageReview>[0] | null {
  if (output === null || !isRecord(output)) return null;
  const explicit = parseJsonValue(output.review);
  const source = isRecord(explicit) ? explicit : output;
  const decision = source.decision;
  if (
    decision !== "accepted" &&
    decision !== "changes_requested" &&
    decision !== "cancelled"
  )
    return null;
  const list = (value: unknown): readonly string[] => {
    const parsed = parseJsonValue(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  };
  return {
    stageRunId: runId,
    stage: stageValue,
    decision,
    findings: list(source.findings),
    requiredChanges: list(source.requiredChanges ?? source.required_changes),
    verificationEvidence: list(
      source.verificationEvidence ?? source.verification_evidence,
    ),
  };
}

function outputBody(
  stageValue: CoordinatedStage,
  payload: StageArtifactPayload,
): string {
  const handoff =
    typeof payload.handoff === "string"
      ? payload.handoff
      : "Candidate handoff is available for review.";
  return `# ${stageValue} stage candidate\n\n${handoff}\n`;
}

function recordView(record: StoredStageRun): StageCoordinatorRun {
  return {
    stageRunId: record.stageRun.id,
    stage: record.stage,
    status: record.stageRun.status,
    currentRole: record.stageRun.currentRole,
    attempt: record.stageRun.attempt,
    executionId: record.executionId,
    sessionId: record.sessionId,
    phase: record.phase,
    candidateVersion: record.candidateVersion,
    reviewVersion: record.reviewVersion,
    reviewDecision: record.reviewDecision,
    artifactRefs: record.stageRun.artifactRefs,
    approvalRef: record.stageRun.approvalRef,
    statusReason: record.stageRun.statusReason,
    revision: record.version.revision,
    hash: record.version.hash,
  };
}

function storedDocument(
  record: MutableStoredStageRun,
  now: UtcIsoTimestamp,
): GovernanceDocument {
  const current = record.document?.frontMatter ?? {};
  return {
    frontMatter: {
      ...current,
      schema_version: 1,
      document_type: "stage_run",
      stage_run_id: record.stageRun.id,
      stage: record.stage,
      stage_key: record.stageRun.stageKey,
      status: record.stageRun.status,
      current_role: record.stageRun.currentRole,
      artifact_refs: record.stageRun.artifactRefs,
      approval_ref: record.stageRun.approvalRef,
      attempt: record.stageRun.attempt,
      status_reason: record.stageRun.statusReason,
      execution_id: record.executionId,
      session_id: record.sessionId,
      phase: record.phase,
      candidate_version: record.candidateVersion,
      review_version: record.reviewVersion,
      review_decision: record.reviewDecision,
      project_idea: record.projectIdea,
      revision: record.version.revision + 1,
      created_at: current.created_at ?? now,
      updated_at: now,
    },
    body: `# ${record.stageRun.id}: ${record.stage}\n\nStatus: ${record.stageRun.status}\n`,
  };
}

function parseStored(
  snapshot: GovernanceSnapshot,
): StageCoordinatorResult<StoredStageRun> {
  const frontMatter = snapshot.document.frontMatter;
  const parsedStage = stage(frontMatter.stage) ? frontMatter.stage : null;
  const parsedRunId = stageRunId(frontMatter.stage_run_id);
  const parsedStatus = stageRunStatus(frontMatter.status)
    ? frontMatter.status
    : null;
  const parsedStageKey =
    typeof frontMatter.stage_key === "string" ? frontMatter.stage_key : null;
  const parsedRole =
    typeof frontMatter.current_role === "string"
      ? frontMatter.current_role
      : null;
  const artifactRefs = Array.isArray(frontMatter.artifact_refs)
    ? frontMatter.artifact_refs.filter(
        (item): item is StageArtifactReference => {
          if (!isRecord(item)) return false;
          return (
            nonEmpty(item.path) &&
            Number.isInteger(item.revision) &&
            (item.kind === "input" ||
              item.kind === "candidate" ||
              item.kind === "approved") &&
            nonEmpty(item.contentHash)
          );
        },
      )
    : [];
  if (
    frontMatter.document_type !== "stage_run" ||
    parsedStage === null ||
    parsedRunId === null ||
    parsedStatus === null ||
    parsedStageKey === null ||
    parsedRole === null ||
    !Number.isInteger(frontMatter.attempt) ||
    typeof frontMatter.project_idea !== "string"
  ) {
    return failure(
      "persistence_failed",
      "Stage run fact has invalid metadata.",
    );
  }
  const approvalRef = isRecord(frontMatter.approval_ref)
    ? frontMatter.approval_ref
    : null;
  const stageRun: StageRun = {
    id: parsedRunId,
    stageKey: parsedStageKey as StageRun["stageKey"],
    status: parsedStatus,
    currentRole: parsedRole as StageRun["currentRole"],
    artifactRefs,
    approvalRef:
      approvalRef !== null &&
      nonEmpty(approvalRef.approvalId) &&
      Number.isInteger(approvalRef.revision) &&
      approvalRef.outcome === "approved" &&
      approvalRef.decidedBy === "user" &&
      typeof approvalRef.decidedAt === "string"
        ? (approvalRef as unknown as StageApprovalReference)
        : null,
    attempt: frontMatter.attempt as number,
    statusReason:
      typeof frontMatter.status_reason === "string"
        ? frontMatter.status_reason
        : null,
  };
  return {
    ok: true,
    value: {
      stageRun,
      stage: parsedStage,
      projectRoot: "",
      projectIdea: frontMatter.project_idea,
      executionId: executionId(frontMatter.execution_id)
        ? frontMatter.execution_id
        : null,
      sessionId:
        typeof frontMatter.session_id === "string"
          ? frontMatter.session_id
          : null,
      phase:
        frontMatter.phase === "producer" || frontMatter.phase === "reviewer"
          ? frontMatter.phase
          : null,
      candidateVersion: versionValue(frontMatter.candidate_version),
      reviewVersion: versionValue(frontMatter.review_version),
      reviewDecision:
        frontMatter.review_decision === "accepted" ||
        frontMatter.review_decision === "changes_requested" ||
        frontMatter.review_decision === "cancelled"
          ? frontMatter.review_decision
          : null,
      version: snapshot.version,
      relativePath: snapshot.relativePath,
      document: snapshot.document,
    },
  };
}

async function collectEvents(
  events: AsyncIterable<AgentEvent>,
): Promise<AgentEvent[]> {
  const result: AgentEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
}

const sharedStageExecutionLock = new ExecutionLock();

export class StageCoordinatorService {
  private readonly runtime: AgentRuntime;
  private readonly now: () => UtcIsoTimestamp;
  private readonly lock: ExecutionLock;
  private readonly registryFactory: () => ProjectRegistryRepository;
  private readonly artifactServiceFactory: (
    root: string,
  ) => StageArtifactService;
  private readonly active = new Map<ExecutionId, ActiveExecution>();

  public constructor(options: StageCoordinatorOptions = {}) {
    this.runtime = options.runtime ?? new FakeAgentAdapter();
    this.now = options.now ?? nowUtc;
    this.lock = options.lock ?? sharedStageExecutionLock;
    this.registryFactory =
      options.registryFactory ?? (() => new ProjectRegistryRepository());
    this.artifactServiceFactory =
      options.artifactServiceFactory ??
      ((root) => new StageArtifactService(root, { now: this.now }));
  }

  public async state(
    input: StageCoordinatorStartInput,
  ): Promise<StageCoordinatorResult<StageCoordinatorState>> {
    const root = await this.projectRoot(input);
    if (!root.ok) return root;
    const records = await this.readAll(root.value);
    if (!records.ok) return records;
    const runs = records.value.sort(
      (left, right) => stageIndex(left.stage) - stageIndex(right.stage),
    );
    const current = this.currentRecord(runs);
    const owner = this.lock.snapshot();
    return {
      ok: true,
      value: {
        projectRoot: root.value,
        active: owner?.projectKey === root.value && owner.executionId !== null,
        currentStage: current?.stage ?? null,
        currentRun: current === undefined ? null : recordView(current),
        runs: runs.map(recordView),
        recoveryRequired:
          current?.stageRun.status === "blocked" ||
          current?.stageRun.status === "recovering",
        approvalRequired:
          current?.stageRun.status === "awaiting_review" &&
          current.reviewDecision === "accepted",
      },
    };
  }

  public async getState(
    input: StageCoordinatorStartInput,
  ): Promise<StageCoordinatorResult<StageCoordinatorState>> {
    return this.state(input);
  }

  public async start(
    input: StageCoordinatorStartInput,
    scenario?: FakeAgentScenario,
  ): Promise<StageCoordinatorResult<StageCoordinatorValue>> {
    const root = await this.projectRoot(input);
    if (!root.ok) return root;
    const project = await this.projectFacts(root.value);
    if (!project.ok) return project;
    const records = await this.readAll(root.value);
    if (!records.ok) return records;
    const current = this.currentRecord(records.value);
    let record: MutableStoredStageRun;
    try {
      if (current === undefined) {
        record = await this.newRun(root.value, project.value.idea, "idea");
      } else if (current.stageRun.status === "changes_requested") {
        record = this.mutable(current);
      } else if (current.stageRun.status === "approved") {
        const next = STAGE_ORDER[stageIndex(current.stage) + 1];
        if (next === undefined)
          return failure(
            "stage_not_ready",
            "All coordinated stages are already approved.",
          );
        record = await this.newRun(
          root.value,
          project.value.idea,
          next,
          approvedArtifactRefs(records.value),
        );
      } else if (current.stageRun.status === "awaiting_review") {
        return failure(
          "approval_required",
          "The current stage is waiting for a user approval decision.",
        );
      } else if (
        current.stageRun.status === "blocked" ||
        current.stageRun.status === "recovering"
      ) {
        return failure(
          "recovery_required",
          "The current stage is blocked and requires resume, retry, or cancel.",
        );
      } else if (current.stageRun.status === "cancelled") {
        return failure(
          "stage_not_ready",
          "A cancelled stage run cannot be started again.",
        );
      } else {
        return failure(
          "execution_active",
          "The current stage already has an active execution.",
        );
      }
    } catch (error) {
      return failure(
        "persistence_failed",
        "The stage run could not be loaded or created.",
        [error instanceof Error ? error.message : String(error)],
      );
    }
    return this.runProducer(
      record,
      root.value,
      input.prompt,
      scenario,
      current?.stageRun.status === "changes_requested",
    );
  }

  public async resume(
    input: StageCoordinatorControlInput,
  ): Promise<StageCoordinatorResult<StageCoordinatorValue>> {
    const root = await this.projectRoot(input);
    if (!root.ok) return root;
    const selected = await this.findRun(root.value, input);
    if (!selected.ok) return selected;
    const record = this.mutable(selected.value);
    if (
      (record.stageRun.status !== "blocked" &&
        record.stageRun.status !== "recovering") ||
      record.executionId === null ||
      record.sessionId === null
    ) {
      return failure(
        "not_resumable",
        "Only a blocked stage run with a precise session ID can resume.",
      );
    }
    const token = this.lock.acquire(root.value, null);
    if (token === null)
      return failure(
        "execution_active",
        "Another stage execution chain is already active.",
      );
    const recovering = transitionStageRun(record.stageRun, "recovering", {
      reason: "User selected resume for the blocked stage run.",
    });
    if (!recovering.ok) {
      this.lock.release(token);
      return failure("transition_failed", recovering.error.message);
    }
    record.stageRun = recovering.value;
    const running = transitionStageRun(record.stageRun, "running");
    if (!running.ok) {
      this.lock.release(token);
      return failure("transition_failed", running.error.message);
    }
    record.stageRun = running.value;
    const packageResult = await this.buildPackage(
      root.value,
      record,
      record.phase ?? "producer",
    );
    if (!packageResult.ok) {
      this.lock.release(token);
      return packageResult;
    }
    const request = this.requestFor(
      root.value,
      record,
      packageResult.value,
      record.phase ?? "producer",
      undefined,
    );
    let session: AgentSession;
    try {
      session = await this.runtime.resume({
        executionId: record.executionId,
        sessionId: record.sessionId,
        startRequest: request,
      });
    } catch (error) {
      const blocked = transitionStageRun(record.stageRun, "blocked", {
        reason: `Resume failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      if (blocked.ok) record.stageRun = blocked.value;
      await this.save(record);
      this.lock.release(token);
      return failure("runtime_failed", "The stage runtime could not resume.", [
        error instanceof Error ? error.message : String(error),
      ]);
    }
    record.executionId = session.executionId;
    record.sessionId = session.sessionId ?? record.sessionId;
    record.phase = record.phase ?? "producer";
    this.lock.assignExecution(token, session.executionId);
    record.version = await this.save(record);
    const active = this.registerActive(
      record,
      session,
      request,
      token,
      record.phase,
    );
    return active.completion;
  }

  public async retry(
    input: StageCoordinatorControlInput,
  ): Promise<StageCoordinatorResult<StageCoordinatorValue>> {
    const root = await this.projectRoot(input);
    if (!root.ok) return root;
    const selected = await this.findRun(root.value, input);
    if (!selected.ok) return selected;
    if (
      selected.value.stageRun.status !== "blocked" &&
      selected.value.stageRun.status !== "changes_requested"
    ) {
      return failure(
        "not_resumable",
        "Only blocked or changes_requested stage runs can be retried.",
      );
    }
    if (
      selected.value.stageRun.status === "blocked" &&
      selected.value.executionId !== null &&
      this.active.has(selected.value.executionId)
    ) {
      return failure(
        "execution_active",
        "The blocked stage still has an active runtime.",
      );
    }
    const record = this.mutable(selected.value);
    const token = this.lock.acquire(root.value, null);
    if (token === null)
      return failure(
        "execution_active",
        "Another stage execution chain is already active.",
      );
    let first = transitionStageRun(record.stageRun, "running", {
      reason: "User selected retry after requested changes.",
    });
    if (record.stageRun.status === "blocked") {
      const recovering = transitionStageRun(record.stageRun, "recovering", {
        reason: "User selected retry for a blocked stage run.",
      });
      first = recovering.ok
        ? transitionStageRun(recovering.value, "running")
        : recovering;
    }
    if (!first.ok) {
      this.lock.release(token);
      return failure("transition_failed", first.error.message);
    }
    record.stageRun = first.value;
    record.executionId = null;
    record.sessionId = null;
    record.phase = "producer";
    const packageResult = await this.buildPackage(
      root.value,
      record,
      "producer",
    );
    if (!packageResult.ok) {
      this.lock.release(token);
      return packageResult;
    }
    const request = this.requestFor(
      root.value,
      record,
      packageResult.value,
      "producer",
      input.note,
    );
    let session: AgentSession;
    try {
      session = await this.runtime.start(request);
    } catch (error) {
      const blocked = transitionStageRun(record.stageRun, "blocked", {
        reason: `Retry start failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      if (blocked.ok) record.stageRun = blocked.value;
      await this.save(record);
      this.lock.release(token);
      return failure("runtime_failed", "The stage runtime could not restart.", [
        error instanceof Error ? error.message : String(error),
      ]);
    }
    record.executionId = session.executionId;
    record.sessionId = session.sessionId;
    this.lock.assignExecution(token, session.executionId);
    record.version = await this.save(record);
    const active = this.registerActive(
      record,
      session,
      request,
      token,
      "producer",
    );
    return active.completion;
  }

  public async cancel(
    input: StageCoordinatorControlInput,
  ): Promise<StageCoordinatorResult<StageCoordinatorControlValue>> {
    const root = await this.projectRoot(input);
    if (!root.ok) return root;
    const selected = await this.findRun(root.value, input);
    if (!selected.ok) return selected;
    const record = this.mutable(selected.value);
    if (record.executionId !== null) {
      const active = this.active.get(record.executionId);
      if (active !== undefined) {
        active.cancelRequested = true;
        const cancelled = await this.runtime.cancel({
          executionId: record.executionId,
        });
        if (!cancelled.ok)
          return failure("runtime_failed", cancelled.message, [cancelled.code]);
        const result = await active.completion;
        if (!result.ok) return result;
        const state = await this.state({ projectRoot: root.value });
        if (!state.ok) return state;
        return {
          ok: true,
          value: {
            projectRoot: root.value,
            run: result.value.run,
            state: state.value,
          },
        };
      }
    }
    if (
      record.stageRun.status !== "blocked" &&
      record.stageRun.status !== "recovering"
    )
      return failure(
        "execution_not_found",
        "No active or recoverable stage execution was found.",
      );
    const cancelled = transitionStageRun(record.stageRun, "cancelled", {
      reason: input.note ?? "User cancelled the stage recovery.",
    });
    if (!cancelled.ok)
      return failure("transition_failed", cancelled.error.message);
    record.stageRun = cancelled.value;
    record.executionId = null;
    record.sessionId = null;
    record.phase = null;
    record.version = await this.save(record);
    await this.audit(root.value, "stage_run_cancelled", record, "recovery", {
      reason: record.stageRun.statusReason ?? "cancelled",
    });
    const state = await this.state({ projectRoot: root.value });
    if (!state.ok) return state;
    return {
      ok: true,
      value: {
        projectRoot: root.value,
        run: recordView(record),
        state: state.value,
      },
    };
  }

  public async decide(
    input: StageCoordinatorDecisionInput,
  ): Promise<StageCoordinatorResult<StageCoordinatorControlValue>> {
    if (!nonEmpty(input.stageRunId) || !nonEmpty(input.note))
      return failure(
        "invalid_input",
        "A stage run ID and decision note are required.",
      );
    const root = await this.projectRoot(input);
    if (!root.ok) return root;
    const selected = await this.findRun(root.value, {
      projectRoot: root.value,
      stageRunId: input.stageRunId,
    });
    if (!selected.ok) return selected;
    const record = this.mutable(selected.value);
    if (
      record.stageRun.status !== "awaiting_review" ||
      record.candidateVersion === null ||
      record.reviewVersion === null
    )
      return failure(
        "approval_required",
        "A stage decision requires a reviewed candidate.",
      );
    const artifact = this.artifactServiceFactory(root.value);
    const decided = await artifact.decide({
      stageRunId: record.stageRun.id,
      stage: record.stage,
      decision: input.decision,
      note: input.note,
      expectedCandidate: record.candidateVersion,
      expectedReview: record.reviewVersion,
      expectedFormal: await this.formalVersion(root.value, record.stage),
    });
    if (!decided.ok)
      return failure(
        decided.error.code === "conflict" ? "conflict" : "approval_required",
        decided.error.message,
        decided.error.details,
      );
    if (input.decision === "approved") {
      const formal = await artifact.readFormal(
        record.stage,
        record.stageRun.id,
      );
      if (!formal.ok || formal.value === null)
        return failure(
          "persistence_failed",
          "Approved stage fact could not be reloaded.",
        );
      const approval: StageApprovalReference = {
        approvalId: decided.value
          .approvalId as StageApprovalReference["approvalId"],
        revision: decided.value.version.revision,
        outcome: "approved",
        decidedBy: "user",
        decidedAt: this.now(),
      };
      const transitioned = transitionStageRun(record.stageRun, "approved", {
        approval,
      });
      if (!transitioned.ok)
        return failure("transition_failed", transitioned.error.message);
      record.stageRun = {
        ...transitioned.value,
        artifactRefs: [
          ...record.stageRun.artifactRefs.filter(
            (item) => item.kind !== "candidate",
          ),
          {
            path: formal.value.relativePath,
            revision: formal.value.version.revision,
            contentHash: formal.value.version.hash,
            kind: "approved",
          },
        ],
        statusReason: "User approved the reviewed stage artifact.",
      };
      record.reviewDecision = "accepted";
    } else {
      const transitioned = transitionStageRun(
        record.stageRun,
        input.decision === "changes_requested"
          ? "changes_requested"
          : "cancelled",
        { reason: input.note },
      );
      if (!transitioned.ok)
        return failure("transition_failed", transitioned.error.message);
      record.stageRun = transitioned.value;
      record.reviewDecision = input.decision;
    }
    record.executionId = null;
    record.sessionId = null;
    record.phase = null;
    record.version = await this.save(record);
    await this.audit(
      root.value,
      `stage_${input.decision}`,
      record,
      input.decision === "approved" ? "status_changed" : "recovery",
      { approval_id: decided.value.approvalId },
    );
    const state = await this.state({ projectRoot: root.value });
    if (!state.ok) return state;
    return {
      ok: true,
      value: {
        projectRoot: root.value,
        run: recordView(record),
        state: state.value,
      },
    };
  }

  public async approve(
    input: Omit<StageCoordinatorDecisionInput, "decision">,
  ): Promise<StageCoordinatorResult<StageCoordinatorControlValue>> {
    return this.decide({ ...input, decision: "approved" });
  }

  public async requestChanges(
    input: Omit<StageCoordinatorDecisionInput, "decision">,
  ): Promise<StageCoordinatorResult<StageCoordinatorControlValue>> {
    return this.decide({ ...input, decision: "changes_requested" });
  }

  private async runProducer(
    record: MutableStoredStageRun,
    root: string,
    prompt: string | undefined,
    scenario: FakeAgentScenario | undefined,
    _rework: boolean,
  ): Promise<StageCoordinatorResult<StageCoordinatorValue>> {
    const token = this.lock.acquire(root, null);
    if (token === null)
      return failure(
        "execution_active",
        "Another stage execution chain is already active.",
      );
    const running = transitionStageRun(
      record.stageRun,
      "running",
      _rework
        ? { reason: "Stage rework started after changes were requested." }
        : undefined,
    );
    if (!running.ok) {
      this.lock.release(token);
      return failure("transition_failed", running.error.message);
    }
    record.stageRun = running.value;
    record.version = await this.save(record);
    const packageResult = await this.buildPackage(root, record, "producer");
    if (!packageResult.ok) {
      this.lock.release(token);
      return packageResult;
    }
    const request = this.requestFor(
      root,
      record,
      packageResult.value,
      "producer",
      prompt,
    );
    let session: AgentSession;
    try {
      session =
        scenario !== undefined && this.runtime instanceof FakeAgentAdapter
          ? await this.runtime.start(request, scenario)
          : await this.runtime.start(request);
    } catch (error) {
      const blocked = transitionStageRun(record.stageRun, "blocked", {
        reason: `Runtime start failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      if (blocked.ok) record.stageRun = blocked.value;
      await this.save(record);
      this.lock.release(token);
      return failure("runtime_failed", "The stage runtime could not start.", [
        error instanceof Error ? error.message : String(error),
      ]);
    }
    record.executionId = session.executionId;
    record.sessionId = session.sessionId;
    record.phase = "producer";
    this.lock.assignExecution(token, session.executionId);
    record.version = await this.save(record);
    const active = this.registerActive(
      record,
      session,
      request,
      token,
      "producer",
    );
    return active.completion;
  }

  private registerActive(
    record: MutableStoredStageRun,
    session: AgentSession,
    request: AgentStartRequest,
    lockToken: string,
    phase: "producer" | "reviewer",
  ): ActiveExecution {
    const active: ActiveExecution = {
      executionId: session.executionId,
      stageRunId: record.stageRun.id,
      phase,
      session,
      request,
      lockToken,
      completion: Promise.resolve(
        failure("runtime_failed", "Stage execution has not completed."),
      ),
      cancelRequested: false,
    };
    const completion = this.finishActive(record, active);
    active.completion = completion;
    this.active.set(session.executionId, active);
    void completion.finally(() => {
      this.active.delete(session.executionId);
      this.lock.release(lockToken);
    });
    return active;
  }

  private async finishActive(
    record: MutableStoredStageRun,
    active: ActiveExecution,
  ): Promise<StageCoordinatorResult<StageCoordinatorValue>> {
    try {
      const events = await collectEvents(active.session.events);
      const result = await active.session.result;
      if (active.phase === "producer") {
        return this.finishProducer(record, active, events, result);
      }
      return this.finishReviewer(record, active, events, result);
    } catch (error) {
      const blocked = transitionStageRun(record.stageRun, "blocked", {
        reason: `Runtime collection failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      if (blocked.ok) {
        record.stageRun = blocked.value;
        record.executionId = active.executionId;
        record.sessionId = active.session.sessionId;
        record.phase = active.phase;
        record.version = await this.save(record);
      }
      return failure(
        "runtime_failed",
        "Stage runtime output could not be collected.",
        [error instanceof Error ? error.message : String(error)],
      );
    }
  }

  private async finishProducer(
    record: MutableStoredStageRun,
    active: ActiveExecution,
    events: readonly AgentEvent[],
    result: AgentResult,
  ): Promise<StageCoordinatorResult<StageCoordinatorValue>> {
    if (result.status !== "completed" || active.cancelRequested) {
      const cleanup =
        result.status === "interrupted" && !active.cancelRequested
          ? ({ ok: true, value: true } as const)
          : await this.cleanup(active.executionId);
      const target =
        active.cancelRequested && cleanup.ok ? "cancelled" : "blocked";
      const transitioned = transitionStageRun(record.stageRun, target, {
        reason:
          result.error?.message ??
          "Stage execution did not complete successfully.",
      });
      if (transitioned.ok) record.stageRun = transitioned.value;
      record.executionId = active.executionId;
      record.sessionId = active.session.sessionId;
      record.phase = "producer";
      record.version = await this.save(record);
      await this.audit(
        record.projectRoot,
        "stage_run_blocked",
        record,
        "recovery",
        { reason: record.stageRun.statusReason ?? "runtime failure" },
      );
      if (!cleanup.ok)
        return failure(
          "cleanup_failed",
          cleanup.error.message,
          cleanup.error.details,
        );
      return this.value(record, null, events, result, null, null, false);
    }
    const cleanup = await this.cleanup(active.executionId);
    if (!cleanup.ok) {
      const blocked = transitionStageRun(record.stageRun, "blocked", {
        reason: `Cleanup failed: ${cleanup.error.message}`,
      });
      if (blocked.ok) record.stageRun = blocked.value;
      record.executionId = active.executionId;
      record.sessionId = active.session.sessionId;
      record.phase = "producer";
      record.version = await this.save(record);
      await this.audit(
        record.projectRoot,
        "stage_run_blocked",
        record,
        "recovery",
        {
          reason: cleanup.error.message,
        },
      );
      return failure(
        "cleanup_failed",
        cleanup.error.message,
        cleanup.error.details,
      );
    }
    const payload = stagePayload(record.stage, result.output);
    const validated =
      payload === null
        ? null
        : validateStageArtifactPayload(record.stage, payload);
    if (validated === null || !validated.ok) {
      const blocked = transitionStageRun(record.stageRun, "blocked", {
        reason: "Stage runtime output failed the stage artifact Schema.",
      });
      if (blocked.ok) record.stageRun = blocked.value;
      record.executionId = active.executionId;
      record.sessionId = active.session.sessionId;
      record.phase = "producer";
      record.version = await this.save(record);
      await this.audit(
        record.projectRoot,
        "stage_output_invalid",
        record,
        "recovery",
        { reason: "invalid_output" },
      );
      return failure(
        "invalid_output",
        "The stage Agent output did not satisfy the stage artifact Schema.",
        validated === null ? [] : [validated.error.message],
      );
    }
    const artifact = this.artifactServiceFactory(record.projectRoot);
    const candidate = await artifact.submitCandidate({
      stageRunId: record.stageRun.id,
      stage: record.stage,
      payload: validated.value,
      body: outputBody(record.stage, validated.value),
      expectedCandidate: record.candidateVersion,
    });
    if (!candidate.ok) {
      const blocked = transitionStageRun(record.stageRun, "blocked", {
        reason: candidate.error.message,
      });
      if (blocked.ok) record.stageRun = blocked.value;
      record.version = await this.save(record);
      return failure(
        candidate.error.code === "conflict" ? "conflict" : "persistence_failed",
        candidate.error.message,
        candidate.error.details,
      );
    }
    const awaiting = transitionStageRun(record.stageRun, "awaiting_review");
    if (!awaiting.ok)
      return failure("transition_failed", awaiting.error.message);
    record.stageRun = {
      ...awaiting.value,
      artifactRefs: [
        ...record.stageRun.artifactRefs.filter(
          (item) => item.kind !== "candidate",
        ),
        {
          path: candidate.value.relativePath,
          revision: candidate.value.version.revision,
          contentHash: candidate.value.version.hash,
          kind: "candidate",
        },
      ],
      statusReason: "Candidate validated; awaiting a read-only stage review.",
    };
    record.candidateVersion = candidate.value.version;
    record.executionId = null;
    record.sessionId = null;
    record.phase = null;
    record.version = await this.save(record);
    const reviewerPackage = await this.buildPackage(
      record.projectRoot,
      record,
      "reviewer",
    );
    if (!reviewerPackage.ok) return reviewerPackage;
    const reviewerRequest = this.requestFor(
      record.projectRoot,
      record,
      reviewerPackage.value,
      "reviewer",
      undefined,
    );
    let reviewerSession: AgentSession;
    try {
      reviewerSession = await this.runtime.start(reviewerRequest);
    } catch (error) {
      const blocked = transitionStageRun(record.stageRun, "blocked", {
        reason: `Reviewer start failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      if (blocked.ok) record.stageRun = blocked.value;
      record.phase = "reviewer";
      record.version = await this.save(record);
      return failure(
        "runtime_failed",
        "The read-only stage reviewer could not start.",
        [error instanceof Error ? error.message : String(error)],
      );
    }
    record.executionId = reviewerSession.executionId;
    record.sessionId = reviewerSession.sessionId;
    record.phase = "reviewer";
    this.lock.assignExecution(active.lockToken, reviewerSession.executionId);
    record.version = await this.save(record);
    const activeReviewer = this.registerActive(
      record,
      reviewerSession,
      reviewerRequest,
      active.lockToken,
      "reviewer",
    );
    const reviewerResult = await activeReviewer.completion;
    if (!reviewerResult.ok) return reviewerResult;
    return reviewerResult;
  }

  private async finishReviewer(
    record: MutableStoredStageRun,
    active: ActiveExecution,
    events: readonly AgentEvent[],
    result: AgentResult,
  ): Promise<StageCoordinatorResult<StageCoordinatorValue>> {
    if (result.status !== "completed" || active.cancelRequested) {
      const cleanup =
        result.status === "interrupted" && !active.cancelRequested
          ? ({ ok: true, value: true } as const)
          : await this.cleanup(active.executionId);
      const target =
        active.cancelRequested && cleanup.ok ? "cancelled" : "blocked";
      const transitioned = transitionStageRun(record.stageRun, target, {
        reason:
          result.error?.message ??
          "Stage review did not complete successfully.",
      });
      if (transitioned.ok) record.stageRun = transitioned.value;
      record.executionId = active.executionId;
      record.sessionId = active.session.sessionId;
      record.phase = "reviewer";
      record.version = await this.save(record);
      await this.audit(
        record.projectRoot,
        "stage_review_blocked",
        record,
        "recovery",
        { reason: record.stageRun.statusReason ?? "review failure" },
      );
      if (!cleanup.ok)
        return failure(
          "cleanup_failed",
          cleanup.error.message,
          cleanup.error.details,
        );
      return this.value(record, null, events, result, null, null, false);
    }
    const cleanup = await this.cleanup(active.executionId);
    if (!cleanup.ok) {
      const blocked = transitionStageRun(record.stageRun, "blocked", {
        reason: `Cleanup failed: ${cleanup.error.message}`,
      });
      if (blocked.ok) record.stageRun = blocked.value;
      record.executionId = active.executionId;
      record.sessionId = active.session.sessionId;
      record.phase = "reviewer";
      record.version = await this.save(record);
      await this.audit(
        record.projectRoot,
        "stage_review_blocked",
        record,
        "recovery",
        {
          reason: cleanup.error.message,
        },
      );
      return failure(
        "cleanup_failed",
        cleanup.error.message,
        cleanup.error.details,
      );
    }
    const input = stageReviewInput(
      record.stage,
      record.stageRun.id,
      result.output,
    );
    const validated = input === null ? null : validateStageReview(input);
    if (validated === null || !validated.ok) {
      const blocked = transitionStageRun(record.stageRun, "blocked", {
        reason: "The reviewer output was invalid.",
      });
      if (blocked.ok) record.stageRun = blocked.value;
      record.executionId = active.executionId;
      record.sessionId = active.session.sessionId;
      record.phase = "reviewer";
      record.version = await this.save(record);
      return failure(
        "invalid_output",
        "The stage reviewer output did not satisfy the review Schema.",
        validated === null ? [] : [validated.error.message],
      );
    }
    const review = await this.artifactServiceFactory(
      record.projectRoot,
    ).reviewCandidate({
      ...validated.value,
      expectedCandidate: record.candidateVersion as FileVersion,
      expectedReview: record.reviewVersion,
    });
    if (!review.ok) {
      const blocked = transitionStageRun(record.stageRun, "blocked", {
        reason: review.error.message,
      });
      if (blocked.ok) record.stageRun = blocked.value;
      record.version = await this.save(record);
      return failure(
        review.error.code === "conflict" ? "conflict" : "persistence_failed",
        review.error.message,
        review.error.details,
      );
    }
    record.reviewVersion = review.value.version;
    record.reviewDecision = review.value.decision;
    record.executionId = null;
    record.sessionId = null;
    record.phase = null;
    if (review.value.decision === "changes_requested") {
      const changes = transitionStageRun(record.stageRun, "changes_requested", {
        reason: review.value.requiredChanges.join("; "),
      });
      if (!changes.ok)
        return failure("transition_failed", changes.error.message);
      record.stageRun = changes.value;
    } else if (review.value.decision === "cancelled") {
      const cancelled = transitionStageRun(record.stageRun, "cancelled", {
        reason: "Reviewer cancelled the stage review.",
      });
      if (!cancelled.ok)
        return failure("transition_failed", cancelled.error.message);
      record.stageRun = cancelled.value;
    } else {
      record.stageRun = {
        ...record.stageRun,
        statusReason: "Review accepted; awaiting explicit user approval.",
      };
    }
    record.version = await this.save(record);
    return this.value(
      record,
      null,
      events,
      result,
      record.candidateVersion,
      {
        revision: review.value.version.revision,
        hash: review.value.version.hash,
        decision: review.value.decision,
      },
      review.value.decision === "accepted",
    );
  }

  private async cleanup(
    id: ExecutionId,
  ): Promise<StageCoordinatorResult<true>> {
    const result = await this.runtime.cleanup({ executionId: id });
    return result.ok
      ? { ok: true, value: true }
      : failure("cleanup_failed", result.message, [result.code]);
  }

  private value(
    record: MutableStoredStageRun,
    packageValue: StageTaskPackage | null,
    events: readonly AgentEvent[],
    result: AgentResult | null,
    candidate: Version,
    review: Readonly<{
      readonly revision: number;
      readonly hash: string;
      readonly decision: StageReviewDecision;
    }> | null,
    approvalRequired: boolean,
  ): StageCoordinatorResult<StageCoordinatorValue> {
    const fallbackRole: StageTaskPackageRole =
      record.phase === "reviewer" || review !== null || approvalRequired
        ? "reviewer"
        : stageRole(record.stage);
    const generated = createStageTaskPackage({
      stageRunId: record.stageRun.id,
      stage: record.stage,
      role: fallbackRole,
      projectIdea: record.projectIdea,
      approvedArtifacts: record.stageRun.artifactRefs.filter(
        (item) => item.kind === "approved",
      ),
      currentGoal: null,
    });
    return {
      ok: true,
      value: {
        projectRoot: record.projectRoot,
        stage: record.stage,
        run: recordView(record),
        taskPackage:
          packageValue ??
          (generated.ok
            ? generated.value
            : ({
                schemaVersion: 1,
                kind: "stage_task_package",
                stageRunId: record.stageRun.id,
                stage: record.stage,
                role: fallbackRole,
                projectIdea: record.projectIdea,
                approvedArtifacts: [],
                currentGoal: null,
                roleTemplate: {} as StageTaskPackage["roleTemplate"],
                outputSchema: {} as StageTaskPackage["outputSchema"],
                permissions: {
                  mode:
                    fallbackRole === "reviewer"
                      ? "read_only"
                      : "workspace_write",
                  canModifyStageArtifacts: fallbackRole !== "reviewer",
                },
              } as StageTaskPackage)),
        events,
        result,
        candidate,
        review,
        approvalRequired,
      },
    };
  }

  private async buildPackage(
    root: string,
    record: MutableStoredStageRun,
    role: "producer" | "reviewer",
  ): Promise<StageCoordinatorResult<StageTaskPackage>> {
    const approvedArtifacts = record.stageRun.artifactRefs.filter(
      (item) => item.kind === "approved",
    );
    const result = createStageTaskPackage({
      stageRunId: record.stageRun.id,
      stage: record.stage,
      role: role === "reviewer" ? "reviewer" : stageRole(record.stage),
      projectIdea: record.projectIdea,
      approvedArtifacts,
      currentGoal: null,
    });
    return result.ok
      ? result
      : failure("stage_order_invalid", result.error.message);
  }

  private requestFor(
    root: string,
    record: MutableStoredStageRun,
    packageValue: StageTaskPackage,
    phase: "producer" | "reviewer",
    prompt: string | undefined,
  ): AgentStartRequest {
    const template = packageValue.roleTemplate;
    const allowedPaths = template.allowedWritePaths.map((path) =>
      resolve(root, path),
    );
    const forbiddenPaths = template.forbiddenWritePaths.map((path) =>
      resolve(root, path),
    );
    return {
      taskId: RUNTIME_TASK_IDS[record.stage],
      goalId: null,
      role: phase === "reviewer" ? "reviewer" : stageRole(record.stage),
      prompt:
        prompt?.trim() ||
        [
          `Run the ${record.stage} preflight stage.`,
          `Return the ${packageValue.outputSchema.id} structured output.`,
          "Do not approve the stage or write formal goals/tasks.",
          JSON.stringify(packageValue),
        ].join("\n"),
      workingDirectory: root,
      allowedPaths,
      forbiddenPaths,
      context: [
        { key: "stage_run_id", value: record.stageRun.id },
        { key: "stage", value: record.stage },
        { key: "stage_task_package", value: JSON.stringify(packageValue) },
      ],
      sessionPolicy: "persistent",
    };
  }

  private async newRun(
    root: string,
    idea: string,
    stageValue: CoordinatedStage,
    artifactRefs: readonly StageArtifactReference[] = [],
  ): Promise<MutableStoredStageRun> {
    const runs = await this.readAll(root);
    const max = runs.ok
      ? runs.value.reduce(
          (value, item) => Math.max(value, Number(item.stageRun.id.slice(10))),
          0,
        )
      : 0;
    const id = `STAGE-RUN-${String(max + 1).padStart(3, "0")}`;
    const created = createStageRun({
      id,
      stageKey: STAGE_RUN_KEYS[stageValue],
      currentRole: STAGE_RUN_ROLES[stageValue],
      artifactRefs,
    });
    if (!created.ok) throw new Error(created.error.message);
    const record: MutableStoredStageRun = {
      stageRun: created.value,
      stage: stageValue,
      projectRoot: root,
      projectIdea: idea,
      executionId: null,
      sessionId: null,
      phase: null,
      candidateVersion: null,
      reviewVersion: null,
      reviewDecision: null,
      version: { revision: 0, hash: "" },
      relativePath: stageRunPath(id),
      document: null,
    };
    record.version = await this.save(record);
    return record;
  }

  private mutable(record: StoredStageRun): MutableStoredStageRun {
    return {
      ...record,
      stageRun: {
        ...record.stageRun,
        artifactRefs: [...record.stageRun.artifactRefs],
      },
    };
  }

  private currentRecord(
    records: readonly StoredStageRun[],
  ): StoredStageRun | undefined {
    const ordered = [...records].sort(
      (left, right) => stageIndex(left.stage) - stageIndex(right.stage),
    );
    return (
      ordered.find(
        (record) =>
          record.stageRun.status !== "approved" &&
          record.stageRun.status !== "cancelled",
      ) ?? ordered.at(-1)
    );
  }

  private async readAll(
    root: string,
  ): Promise<StageCoordinatorResult<StoredStageRun[]>> {
    const repository = new GovernanceRepository(root);
    let names: readonly string[];
    try {
      names = await readdir(resolve(root, STAGE_RUN_DIRECTORY));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return { ok: true, value: [] };
      return failure(
        "persistence_failed",
        "Stage run directory could not be read.",
        [error instanceof Error ? error.message : String(error)],
      );
    }
    const result: StoredStageRun[] = [];
    for (const name of names.filter((item) => item.endsWith(".md"))) {
      const snapshot = await repository.read(`${STAGE_RUN_DIRECTORY}/${name}`);
      if (!snapshot.ok)
        return failure(
          "persistence_failed",
          snapshot.error.message,
          snapshot.error.details,
        );
      const parsed = parseStored(snapshot.value);
      if (!parsed.ok) return parsed;
      result.push({ ...parsed.value, projectRoot: root });
    }
    return { ok: true, value: result };
  }

  private async save(record: MutableStoredStageRun): Promise<FileVersion> {
    const repository = new GovernanceRepository(record.projectRoot);
    const document = storedDocument(record, this.now());
    const written = await repository.write(
      record.relativePath,
      document,
      record.version.revision === 0 ? null : record.version,
    );
    if (!written.ok)
      throw new Error(
        `${written.error.message} ${written.error.details.join("; ")}`,
      );
    record.document = document;
    return written.value.version;
  }

  private async findRun(
    root: string,
    input: StageCoordinatorControlInput,
  ): Promise<StageCoordinatorResult<StoredStageRun>> {
    const records = await this.readAll(root);
    if (!records.ok) return records;
    const found = records.value.find(
      (record) =>
        (input.stageRunId !== undefined &&
          record.stageRun.id === input.stageRunId) ||
        (input.executionId !== undefined &&
          record.executionId === input.executionId),
    );
    return found === undefined
      ? failure("execution_not_found", "Stage execution was not found.")
      : { ok: true, value: found };
  }

  private async formalVersion(
    root: string,
    stageValue: CoordinatedStage,
  ): Promise<FileVersion | null> {
    const repository = new GovernanceRepository(root);
    const read = await repository.read(stageArtifactRelativePath(stageValue));
    return read.ok ? read.value.version : null;
  }

  private async projectFacts(
    root: string,
  ): Promise<StageCoordinatorResult<{ readonly idea: string }>> {
    const read = await new GovernanceRepository(root).read(
      ".personal-workspace/project.md",
    );
    if (!read.ok)
      return failure(
        "project_facts_invalid",
        read.error.message,
        read.error.details,
      );
    const idea = read.value.document.frontMatter.idea;
    return nonEmpty(idea)
      ? { ok: true, value: { idea } }
      : failure(
          "project_facts_invalid",
          "The project fact document has no usable idea.",
        );
  }

  private async projectRoot(
    input:
      | StageCoordinatorStartInput
      | StageCoordinatorControlInput
      | StageCoordinatorDecisionInput,
  ): Promise<StageCoordinatorResult<string>> {
    if (
      typeof input.projectRoot === "string" &&
      input.projectRoot.trim().length > 0
    )
      return { ok: true, value: resolve(input.projectRoot) };
    if (
      typeof input.projectKey !== "string" ||
      input.projectKey.trim().length === 0
    )
      return failure(
        "invalid_input",
        "A projectRoot or projectKey is required.",
      );
    let registry: ProjectRegistryRepository;
    try {
      registry = this.registryFactory();
    } catch (error) {
      return failure(
        "project_not_found",
        "The project registry could not be opened.",
        [error instanceof Error ? error.message : String(error)],
      );
    }
    try {
      const listed = registry.list();
      if (!listed.ok)
        return failure(
          "project_not_found",
          listed.error.message,
          listed.error.details,
        );
      const record = listed.value.find(
        (item) => item.projectKey === input.projectKey && !item.archived,
      );
      return record === undefined
        ? failure(
            "project_not_found",
            "Project is not registered or is archived.",
          )
        : { ok: true, value: resolve(record.rootPath) };
    } finally {
      registry.close();
    }
  }

  private async audit(
    root: string,
    action: string,
    record: MutableStoredStageRun,
    type: "recovery" | "status_changed",
    details: Readonly<Record<string, string>>,
  ): Promise<StageCoordinatorResult<true>> {
    const repository = new AuditLogRepository(root);
    const current = await repository.readAll();
    if (!current.ok)
      return failure(
        "audit_failed",
        current.error.message,
        current.error.details,
      );
    const next =
      current.value.reduce(
        (max, event) => Math.max(max, Number(event.id.slice(5))),
        0,
      ) + 1;
    const created = createAuditEvent({
      id: parseFormalId(`EXEC-${String(next).padStart(3, "0")}`) as ExecutionId,
      occurredAt: this.now(),
      type,
      actor: "system",
      action,
      relatedObjectIds: [],
      statusChange:
        type === "status_changed"
          ? {
              from: "in_review",
              to: "completed",
              reason: "Stage coordinator recorded the user decision.",
            }
          : null,
      details: {
        stage: record.stage,
        stage_run_id: record.stageRun.id,
        ...details,
      },
    });
    if (!created.ok)
      return failure(
        "audit_failed",
        created.error.message,
        created.error.details,
      );
    const appended = await repository.append(created.value);
    return appended.ok
      ? { ok: true, value: true }
      : failure("audit_failed", appended.error.message, appended.error.details);
  }
}
