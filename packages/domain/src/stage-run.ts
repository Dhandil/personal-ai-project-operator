import type { UtcIsoTimestamp } from "@personal-ai-operator/contracts";

import { getRole, type RoleKey } from "./role.js";
import {
  DEFAULT_STAGE_DEFINITIONS,
  type DomainResult,
  type StageKey,
} from "./workflow.js";
import { recordFailure } from "./record.js";

/**
 * A stage run is a domain record, not a projection of whether a file exists.
 * Its status must be advanced explicitly through the guarded transitions below.
 */
export const stageRunStatuses = [
  "pending",
  "running",
  "awaiting_review",
  "changes_requested",
  "approved",
  "blocked",
  "cancelled",
  "recovering",
] as const;

export type StageRunStatus = (typeof stageRunStatuses)[number];
export type StageRunId = string;

export type StageArtifactReference = Readonly<{
  readonly path: string;
  readonly revision: number;
  readonly contentHash: string;
  readonly kind: "input" | "candidate" | "approved";
}>;

export type StageApprovalReference = Readonly<{
  readonly approvalId: string;
  readonly revision: number;
  readonly outcome: "approved";
  readonly decidedBy: "user";
  readonly decidedAt: UtcIsoTimestamp;
}>;

export type StageRun = Readonly<{
  readonly id: StageRunId;
  readonly stageKey: StageKey;
  readonly status: StageRunStatus;
  readonly currentRole: RoleKey;
  readonly artifactRefs: readonly StageArtifactReference[];
  readonly approvalRef: StageApprovalReference | null;
  readonly attempt: number;
  readonly statusReason: string | null;
}>;

export type StageRunInput = Readonly<{
  readonly id: StageRunId;
  readonly stageKey: StageKey;
  readonly currentRole: RoleKey;
  readonly artifactRefs?: readonly StageArtifactReference[];
}>;

export type StageRunTransitionOptions = Readonly<{
  readonly reason?: string;
  readonly approval?: StageApprovalReference;
}>;

const STAGE_RUN_TRANSITIONS: Readonly<
  Record<StageRunStatus, readonly StageRunStatus[]>
> = {
  pending: ["running", "cancelled"],
  running: ["awaiting_review", "blocked", "cancelled", "recovering"],
  awaiting_review: ["approved", "changes_requested", "blocked", "cancelled"],
  changes_requested: ["running", "cancelled"],
  approved: [],
  blocked: ["recovering", "cancelled"],
  cancelled: [],
  recovering: ["running", "blocked", "cancelled"],
};

const REASON_REQUIRED_STATUSES: readonly StageRunStatus[] = [
  "changes_requested",
  "blocked",
  "cancelled",
  "recovering",
];

function isKnownStage(stageKey: StageKey): boolean {
  return DEFAULT_STAGE_DEFINITIONS.some((stage) => stage.key === stageKey);
}

function hasValidArtifactReference(reference: StageArtifactReference): boolean {
  return (
    reference.path.trim().length > 0 &&
    Number.isInteger(reference.revision) &&
    reference.revision > 0 &&
    reference.contentHash.trim().length > 0
  );
}

function hasValidApprovalReference(
  approval: StageApprovalReference | undefined,
): approval is StageApprovalReference {
  return (
    approval !== undefined &&
    approval.approvalId.trim().length > 0 &&
    Number.isInteger(approval.revision) &&
    approval.revision > 0 &&
    approval.outcome === "approved" &&
    approval.decidedBy === "user"
  );
}

function requiresReason(status: StageRunStatus): boolean {
  return REASON_REQUIRED_STATUSES.includes(status);
}

export function canTransitionStageRun(
  fromStatus: StageRunStatus,
  toStatus: StageRunStatus,
): boolean {
  return STAGE_RUN_TRANSITIONS[fromStatus].includes(toStatus);
}

export function createStageRun(input: StageRunInput): DomainResult<StageRun> {
  if (
    input.id.trim().length === 0 ||
    !isKnownStage(input.stageKey) ||
    getRole(input.currentRole) === undefined
  ) {
    return recordFailure(
      "invalid_stage_run",
      "Stage run identity, stage and responsibility role are required.",
    );
  }

  const artifactRefs = input.artifactRefs ?? [];
  if (!artifactRefs.every(hasValidArtifactReference)) {
    return recordFailure(
      "invalid_stage_run",
      "Stage artifact references must include a path, positive revision and content hash.",
    );
  }

  return {
    ok: true,
    value: {
      id: input.id,
      stageKey: input.stageKey,
      status: "pending",
      currentRole: input.currentRole,
      artifactRefs: artifactRefs.map((reference) => ({ ...reference })),
      approvalRef: null,
      attempt: 1,
      statusReason: null,
    },
  };
}

export function transitionStageRun(
  run: StageRun,
  toStatus: StageRunStatus,
  options: StageRunTransitionOptions = {},
): DomainResult<StageRun> {
  if (!canTransitionStageRun(run.status, toStatus)) {
    return recordFailure(
      "invalid_stage_run_transition",
      `Stage run cannot transition from ${run.status} to ${toStatus}.`,
    );
  }

  if (requiresReason(toStatus) && (options.reason?.trim() ?? "").length === 0) {
    return recordFailure(
      "reason_required",
      `A reason is required when transitioning to ${toStatus}.`,
    );
  }

  if (toStatus === "approved" && !hasValidApprovalReference(options.approval)) {
    return recordFailure(
      "stage_approval_required",
      "Only an explicit user approval reference can approve a stage run.",
    );
  }

  return {
    ok: true,
    value: {
      ...run,
      status: toStatus,
      approvalRef:
        toStatus === "approved" ? (options.approval ?? null) : run.approvalRef,
      attempt:
        toStatus === "running" && run.status === "changes_requested"
          ? run.attempt + 1
          : run.attempt,
      statusReason: options.reason?.trim() || null,
    },
  };
}

export function isStageRunApproved(run: StageRun): boolean {
  return run.status === "approved" && run.approvalRef !== null;
}
