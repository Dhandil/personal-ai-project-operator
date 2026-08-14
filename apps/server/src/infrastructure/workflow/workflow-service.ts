import type { UtcIsoTimestamp } from "@personal-ai-operator/contracts";
import {
  DEFAULT_STAGE_DEFINITIONS,
  applyStageSkipDecision,
  suggestStageSkip,
  type Stage,
  type StageKey,
  type StageSkipProposal,
  type UserSkipDecision,
  type Workflow,
} from "@personal-ai-operator/domain";

import { GovernanceRepository } from "../files/governance-repository.js";
import type { GovernanceDocument } from "../files/governance-codec.js";
import {
  ProjectRegistryRepository,
  type ProjectIndexRecord,
} from "../registry/project-registry-repository.js";
import type { ProjectRegistryFactory } from "../projects/project-startup.js";

type ArtifactState = "available" | "missing";

export type StageArtifactLink = Readonly<{
  readonly relativePath: string;
  readonly state: ArtifactState;
}>;

export type WorkflowStageView = Readonly<
  Stage & {
    readonly artifacts: readonly StageArtifactLink[];
  }
>;

export type WorkflowView = Readonly<{
  readonly projectKey: string;
  readonly projectRoot: string;
  readonly revision: number;
  readonly currentStage: StageKey | null;
  readonly stages: readonly WorkflowStageView[];
}>;

export type StageSkipExplanation = Readonly<{
  readonly material: readonly string[];
  readonly missing: readonly string[];
  readonly risks: readonly string[];
}>;

export type WorkflowErrorCode =
  | "invalid_input"
  | "registry_failed"
  | "project_not_found"
  | "workflow_not_found"
  | "invalid_workflow"
  | "invalid_stage"
  | "reason_required"
  | "user_decision_required"
  | "revision_mismatch"
  | "write_failed";

export type WorkflowError = Readonly<{
  readonly code: WorkflowErrorCode;
  readonly message: string;
  readonly details: readonly string[];
}>;

export type WorkflowResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: WorkflowError }>;

export type StageSkipSuggestion = Readonly<{
  readonly projectKey: string;
  readonly proposal: StageSkipProposal;
  readonly explanation: StageSkipExplanation;
  readonly workflow: WorkflowView;
}>;

export type StageSkipDecision = Readonly<{
  readonly projectKey: string;
  readonly changed: boolean;
  readonly decision: UserSkipDecision;
  readonly workflow: WorkflowView;
}>;

export type WorkflowServiceOptions = Readonly<{
  readonly registryFactory?: ProjectRegistryFactory;
  readonly now?: () => UtcIsoTimestamp;
}>;

type WorkflowSnapshot = Readonly<{
  readonly record: ProjectIndexRecord;
  readonly document: GovernanceDocument;
  readonly workflow: Workflow;
  readonly revision: number;
  readonly hash: string;
}>;

type StageRecord = Readonly<{
  readonly key: StageKey;
  readonly title: string;
  readonly order: number;
  readonly status: Stage["status"];
  readonly skipReason?: string;
}>;

const stageArtifactPaths: Readonly<Record<StageKey, string>> = {
  "idea-clarification": ".personal-workspace/stages/01-idea/01-idea.md",
  "problem-definition":
    ".personal-workspace/stages/02-discovery/02-discovery.md",
  "user-scenarios": ".personal-workspace/stages/02-discovery/02-discovery.md",
  "discovery-validation":
    ".personal-workspace/stages/02-discovery/02-discovery.md",
  "product-requirements": ".personal-workspace/stages/03-spec/03-spec.md",
  "mvp-scope": ".personal-workspace/stages/03-spec/03-spec.md",
  "system-design": ".personal-workspace/stages/03-spec/03-spec.md",
  "development-plan": ".personal-workspace/stages/03-spec/03-spec.md",
  "first-short-term-goal": ".personal-workspace/stages/03-spec/03-spec.md",
  execution: ".personal-workspace/stages/03-spec/03-spec.md",
};

function failure<Value>(
  code: WorkflowErrorCode,
  message: string,
  details: readonly string[] = [],
): WorkflowResult<Value> {
  return { ok: false, error: { code, message, details } };
}

function currentTimestamp(): UtcIsoTimestamp {
  return new Date().toISOString() as UtcIsoTimestamp;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStageKey(value: unknown): value is StageKey {
  return DEFAULT_STAGE_DEFINITIONS.some((stage) => stage.key === value);
}

function isStageStatus(value: unknown): value is Stage["status"] {
  return (
    value === "draft" ||
    value === "in_progress" ||
    value === "completed" ||
    value === "skipped"
  );
}

function parseStage(value: unknown): StageRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    !isStageKey(value.key) ||
    typeof value.title !== "string" ||
    !Number.isInteger(value.order) ||
    (value.order as number) < 1 ||
    !isStageStatus(value.status) ||
    (value.skipReason !== undefined && typeof value.skipReason !== "string")
  ) {
    return null;
  }
  return {
    key: value.key,
    title: value.title,
    order: value.order as number,
    status: value.status,
    ...(value.skipReason === undefined ? {} : { skipReason: value.skipReason }),
  };
}

function parseWorkflow(document: GovernanceDocument): WorkflowResult<Workflow> {
  if (document.frontMatter.document_type !== "workflow") {
    return failure("invalid_workflow", "Workflow document type is invalid.");
  }
  const stagesValue = document.frontMatter.stages;
  if (!Array.isArray(stagesValue)) {
    return failure("invalid_workflow", "Workflow stages must be an array.");
  }
  const stages = stagesValue.map(parseStage);
  if (stages.some((stage) => stage === null)) {
    return failure("invalid_workflow", "Workflow contains an invalid stage.");
  }
  const parsedStages = stages as StageRecord[];
  const currentStage = document.frontMatter.current_stage;
  if (currentStage !== null && !isStageKey(currentStage)) {
    return failure("invalid_workflow", "Workflow current_stage is invalid.");
  }
  const keys = new Set(parsedStages.map((stage) => stage.key));
  if (keys.size !== parsedStages.length) {
    return failure("invalid_workflow", "Workflow stage keys must be unique.");
  }
  if (
    currentStage !== null &&
    !parsedStages.some((stage) => stage.key === currentStage)
  ) {
    return failure(
      "invalid_workflow",
      "Workflow current_stage must refer to a listed stage.",
    );
  }
  return {
    ok: true,
    value: {
      stages: parsedStages,
      currentStage,
    },
  };
}

function explanationPart(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseExplanation(
  input: Record<string, unknown>,
): StageSkipExplanation {
  const explanation = isRecord(input.explanation) ? input.explanation : input;
  return {
    material: explanationPart(explanation.material),
    missing: explanationPart(explanation.missing),
    risks: explanationPart(explanation.risks),
  };
}

function rationaleFromExplanation(
  rationale: unknown,
  explanation: StageSkipExplanation,
): string {
  if (typeof rationale === "string" && rationale.trim().length > 0) {
    return rationale.trim();
  }
  return [
    `材料：${explanation.material.join("；") || "未提供"}`,
    `缺失：${explanation.missing.join("；") || "未提供"}`,
    `风险：${explanation.risks.join("；") || "未提供"}`,
  ].join("。 ");
}

function projectKeyInput(input: Record<string, unknown>): string | null {
  return typeof input.projectKey === "string" && input.projectKey.length > 0
    ? input.projectKey
    : null;
}

export class WorkflowService {
  private readonly registryFactory: ProjectRegistryFactory;
  private readonly now: () => UtcIsoTimestamp;

  public constructor(options: WorkflowServiceOptions = {}) {
    this.registryFactory =
      options.registryFactory ?? (() => new ProjectRegistryRepository());
    this.now = options.now ?? currentTimestamp;
  }

  public async getWorkflow(
    projectKey: string,
  ): Promise<WorkflowResult<WorkflowView>> {
    const snapshot = await this.readSnapshot(projectKey);
    if (!snapshot.ok) {
      return snapshot;
    }
    return { ok: true, value: await this.toView(snapshot.value) };
  }

  public async proposeSkip(
    input: unknown,
  ): Promise<WorkflowResult<StageSkipSuggestion>> {
    if (!isRecord(input)) {
      return failure("invalid_input", "Skip proposal input must be an object.");
    }
    const projectKey = projectKeyInput(input);
    const stageKey = input.stageKey;
    if (projectKey === null || !isStageKey(stageKey)) {
      return failure(
        "invalid_input",
        "A projectKey and valid stageKey are required.",
      );
    }
    const snapshot = await this.readSnapshot(projectKey);
    if (!snapshot.ok) {
      return snapshot;
    }
    const explanation = parseExplanation(input);
    const proposal = suggestStageSkip(
      snapshot.value.workflow,
      stageKey,
      rationaleFromExplanation(input.rationale, explanation),
    );
    if (!proposal.ok) {
      return failure(
        proposal.error.code as WorkflowErrorCode,
        proposal.error.message,
      );
    }
    return {
      ok: true,
      value: {
        projectKey,
        proposal: proposal.value,
        explanation,
        workflow: await this.toView(snapshot.value),
      },
    };
  }

  public async decideSkip(
    input: unknown,
  ): Promise<WorkflowResult<StageSkipDecision>> {
    if (!isRecord(input)) {
      return failure("invalid_input", "Skip decision input must be an object.");
    }
    const projectKey = projectKeyInput(input);
    const proposalInput = isRecord(input.proposal) ? input.proposal : input;
    const decisionInput = isRecord(input.decision) ? input.decision : input;
    const stageKey = proposalInput.stageKey;
    if (
      projectKey === null ||
      !isStageKey(stageKey) ||
      proposalInput.proposedBy !== "agent" ||
      typeof proposalInput.rationale !== "string"
    ) {
      return failure("invalid_input", "A valid agent proposal is required.");
    }
    if (
      decisionInput.decidedBy !== "user" ||
      typeof decisionInput.approved !== "boolean" ||
      typeof decisionInput.reason !== "string" ||
      decisionInput.reason.trim().length === 0
    ) {
      return failure(
        "user_decision_required",
        "A user decision with a reason is required.",
      );
    }
    const snapshot = await this.readSnapshot(projectKey);
    if (!snapshot.ok) {
      return snapshot;
    }
    const proposal: StageSkipProposal = {
      stageKey,
      proposedBy: "agent",
      rationale: proposalInput.rationale.trim(),
    };
    const decision: UserSkipDecision = {
      decidedBy: "user",
      approved: decisionInput.approved,
      reason: decisionInput.reason,
    };
    const applied = applyStageSkipDecision(
      snapshot.value.workflow,
      proposal,
      decision,
    );
    if (!applied.ok) {
      return failure(
        applied.error.code as WorkflowErrorCode,
        applied.error.message,
      );
    }
    if (!decision.approved) {
      return {
        ok: true,
        value: {
          projectKey,
          changed: false,
          decision,
          workflow: await this.toView(snapshot.value),
        },
      };
    }

    const nextDocument: GovernanceDocument = {
      frontMatter: {
        ...snapshot.value.document.frontMatter,
        revision: snapshot.value.revision + 1,
        updated_at: this.now(),
        current_stage: applied.value.currentStage,
        stages: applied.value.stages,
      },
      body: snapshot.value.document.body,
    };
    const written = await new GovernanceRepository(
      snapshot.value.record.rootPath,
    ).write(".personal-workspace/workflow.md", nextDocument, {
      revision: snapshot.value.revision,
      hash: snapshot.value.hash,
    });
    if (!written.ok) {
      return failure(
        written.error.code === "revision_mismatch" ||
          written.error.code === "hash_mismatch"
          ? "revision_mismatch"
          : "write_failed",
        written.error.message,
        written.error.details,
      );
    }
    const updatedSnapshot = await this.readSnapshot(projectKey);
    if (!updatedSnapshot.ok) {
      return updatedSnapshot;
    }
    return {
      ok: true,
      value: {
        projectKey,
        changed: true,
        decision,
        workflow: await this.toView(updatedSnapshot.value),
      },
    };
  }

  private async findProject(
    projectKey: string,
  ): Promise<WorkflowResult<ProjectIndexRecord>> {
    let registry: ProjectRegistryRepository;
    try {
      registry = this.registryFactory();
    } catch (error) {
      return failure(
        "registry_failed",
        "The project registry could not be opened.",
        [error instanceof Error ? error.message : String(error)],
      );
    }
    try {
      const listed = registry.list();
      if (!listed.ok) {
        return failure(
          "registry_failed",
          listed.error.message,
          listed.error.details,
        );
      }
      const project = listed.value.find(
        (record) =>
          record.projectKey === projectKey && record.archived === false,
      );
      return project === undefined
        ? failure(
            "project_not_found",
            "Project is not registered or is archived.",
          )
        : { ok: true, value: project };
    } finally {
      registry.close();
    }
  }

  private async readSnapshot(
    projectKey: string,
  ): Promise<WorkflowResult<WorkflowSnapshot>> {
    const project = await this.findProject(projectKey);
    if (!project.ok) {
      return project;
    }
    const read = await new GovernanceRepository(project.value.rootPath).read(
      ".personal-workspace/workflow.md",
    );
    if (!read.ok) {
      return failure(
        read.error.code === "not_found"
          ? "workflow_not_found"
          : "invalid_workflow",
        read.error.message,
        read.error.details,
      );
    }
    const workflow = parseWorkflow(read.value.document);
    if (!workflow.ok) {
      return workflow;
    }
    return {
      ok: true,
      value: {
        record: project.value,
        document: read.value.document,
        workflow: workflow.value,
        revision: read.value.version.revision,
        hash: read.value.version.hash,
      },
    };
  }

  private async toView(snapshot: WorkflowSnapshot): Promise<WorkflowView> {
    const stages = await Promise.all(
      snapshot.workflow.stages.map(async (stage) => {
        const relativePath = stageArtifactPaths[stage.key];
        const artifact = await new GovernanceRepository(
          snapshot.record.rootPath,
        ).read(relativePath);
        return {
          ...stage,
          artifacts: [
            {
              relativePath,
              state: artifact.ok ? "available" : "missing",
            },
          ],
        } satisfies WorkflowStageView;
      }),
    );
    return {
      projectKey: snapshot.record.projectKey,
      projectRoot: snapshot.record.rootPath,
      revision: snapshot.revision,
      currentStage: snapshot.workflow.currentStage,
      stages,
    };
  }
}
