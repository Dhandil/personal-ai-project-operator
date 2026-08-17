import type { StageArtifactReference } from "./stage-run.js";
import type { DomainResult } from "./workflow.js";
import { recordFailure } from "./record.js";
import { preflightStages, type PreflightStage } from "./stage-task-package.js";

export type StageArtifactPayload = Readonly<Record<string, unknown>>;

export type StageReviewDecision =
  "accepted" | "changes_requested" | "cancelled";

export type StageReviewInput = Readonly<{
  readonly stageRunId: string;
  readonly stage: PreflightStage;
  readonly decision: StageReviewDecision;
  readonly findings: readonly string[];
  readonly requiredChanges: readonly string[];
  readonly verificationEvidence: readonly string[];
}>;

const STAGE_ARTIFACT_KINDS: Readonly<Record<PreflightStage, string>> = {
  idea: "idea_result",
  discovery: "discovery_result",
  spec: "spec_result",
  planning: "planning_draft",
};

const STAGE_ARTIFACT_REQUIRED_FIELDS: Readonly<
  Record<PreflightStage, readonly string[]>
> = {
  idea: [
    "problemStatement",
    "assumptions",
    "openQuestions",
    "artifactRefs",
    "handoff",
  ],
  discovery: [
    "userScenarios",
    "evidence",
    "risks",
    "decisions",
    "artifactRefs",
    "handoff",
  ],
  spec: [
    "requirements",
    "constraints",
    "validationPlan",
    "artifactRefs",
    "handoff",
  ],
  planning: [
    "goalDrafts",
    "roleDrafts",
    "taskDrafts",
    "dependencyGraph",
    "handoff",
  ],
};

const STAGE_ARTIFACT_PATHS: Readonly<Record<PreflightStage, string>> = {
  idea: ".personal-workspace/stages/01-idea/01-idea.md",
  discovery: ".personal-workspace/stages/02-discovery/02-discovery.md",
  spec: ".personal-workspace/stages/03-spec/03-spec.md",
  planning: ".personal-workspace/stages/03-spec/planning-draft.md",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string" && item.trim().length > 0)
  );
}

function isReferenceArray(
  value: unknown,
): value is readonly StageArtifactReference[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        isNonEmptyString(item.path) &&
        Number.isInteger(item.revision) &&
        Number(item.revision) > 0 &&
        isNonEmptyString(item.contentHash),
    )
  );
}

function stageIsKnown(stage: string): stage is PreflightStage {
  return preflightStages.includes(stage as PreflightStage);
}

export function stageArtifactRelativePath(stage: PreflightStage): string {
  return STAGE_ARTIFACT_PATHS[stage];
}

export function stageArtifactRequiredFields(
  stage: PreflightStage,
): readonly string[] {
  return [...STAGE_ARTIFACT_REQUIRED_FIELDS[stage]];
}

export function stageArtifactKind(stage: PreflightStage): string {
  return STAGE_ARTIFACT_KINDS[stage];
}

export function validateStageArtifactPayload(
  stage: PreflightStage,
  value: unknown,
): DomainResult<StageArtifactPayload> {
  if (!stageIsKnown(stage) || !isRecord(value)) {
    return recordFailure(
      "invalid_stage_artifact",
      "Stage artifact payload must be a mapping for a known stage.",
    );
  }

  if (value.schemaVersion !== 1) {
    return recordFailure(
      "invalid_stage_artifact",
      "Stage artifact payload schemaVersion must be 1.",
    );
  }
  if (value.kind !== STAGE_ARTIFACT_KINDS[stage] || value.stage !== stage) {
    return recordFailure(
      "invalid_stage_artifact",
      `Stage artifact kind and stage must match ${stage}.`,
    );
  }

  const missing = STAGE_ARTIFACT_REQUIRED_FIELDS[stage].filter(
    (field) => !(field in value),
  );
  if (missing.length > 0) {
    return recordFailure(
      "invalid_stage_artifact",
      "Stage artifact payload is missing required fields.",
    );
  }

  const stringFields =
    stage === "idea" ? ["problemStatement", "handoff"] : ["handoff"];
  if (stringFields.some((field) => !isNonEmptyString(value[field]))) {
    return recordFailure(
      "invalid_stage_artifact",
      "Stage artifact text fields must not be empty.",
    );
  }

  const arrayFields = STAGE_ARTIFACT_REQUIRED_FIELDS[stage].filter(
    (field) =>
      field !== "handoff" &&
      field !== "dependencyGraph" &&
      !stringFields.includes(field),
  );
  if (
    arrayFields.some((field) =>
      field === "artifactRefs"
        ? !isReferenceArray(value[field])
        : !isStringArray(value[field]),
    )
  ) {
    return recordFailure(
      "invalid_stage_artifact",
      "Stage artifact collection fields must be arrays of valid values.",
    );
  }

  if (
    stage === "planning" &&
    (!isStringArray(value.goalDrafts) ||
      !isStringArray(value.roleDrafts) ||
      !isStringArray(value.taskDrafts) ||
      !isRecord(value.dependencyGraph))
  ) {
    return recordFailure(
      "invalid_stage_artifact",
      "Planning drafts require goal, role, task and dependency collections.",
    );
  }

  // Return all fields, including unknown ones, so a later write can preserve them.
  return { ok: true, value: { ...value } };
}

export function validateStageReview(
  input: StageReviewInput,
): DomainResult<StageReviewInput> {
  if (
    input.stageRunId.trim().length === 0 ||
    !stageIsKnown(input.stage) ||
    !["accepted", "changes_requested", "cancelled"].includes(input.decision) ||
    !isStringArray(input.findings) ||
    !isStringArray(input.requiredChanges) ||
    !isStringArray(input.verificationEvidence)
  ) {
    return recordFailure(
      "invalid_stage_review",
      "Stage review must contain a known stage, decision and structured evidence.",
    );
  }
  if (
    input.decision === "changes_requested" &&
    input.requiredChanges.length === 0
  ) {
    return recordFailure(
      "invalid_stage_review",
      "A changes_requested review must identify required changes.",
    );
  }
  return {
    ok: true,
    value: {
      ...input,
      stageRunId: input.stageRunId.trim(),
      findings: input.findings.map((item) => item.trim()),
      requiredChanges: input.requiredChanges.map((item) => item.trim()),
      verificationEvidence: input.verificationEvidence.map((item) =>
        item.trim(),
      ),
    },
  };
}
