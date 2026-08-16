import type { GoalId } from "@personal-ai-operator/contracts";

import { type StageArtifactReference, type StageRunId } from "./stage-run.js";
import { recordFailure } from "./record.js";
import type { DomainResult } from "./workflow.js";

export const preflightStages = [
  "idea",
  "discovery",
  "spec",
  "planning",
] as const;
export type PreflightStage = (typeof preflightStages)[number];

export const preflightRoleKeys = [
  "project-lead",
  "idea",
  "discovery",
  "spec",
  "planner",
] as const;
export type PreflightRoleKey = (typeof preflightRoleKeys)[number];
export type StageTaskPackageRole = PreflightRoleKey | "reviewer";

export const stageOutputSchemaIds = [
  "stage_coordination_v1",
  "idea_result_v1",
  "discovery_result_v1",
  "spec_result_v1",
  "planning_draft_v1",
  "stage_review_result_v1",
] as const;
export type StageOutputSchemaId = (typeof stageOutputSchemaIds)[number];

export type StageOutputRule = Readonly<{
  readonly id: StageOutputSchemaId;
  readonly version: 1;
  readonly requiredFields: readonly string[];
  readonly description: string;
}>;

export type PreflightRoleTemplate = Readonly<{
  readonly key: PreflightRoleKey;
  readonly title: string;
  readonly responsibilities: readonly string[];
  readonly forbiddenActions: readonly string[];
  readonly mustRead: readonly string[];
  readonly onDemandRead: readonly string[];
  readonly allowedWritePaths: readonly string[];
  readonly forbiddenWritePaths: readonly string[];
  readonly outputSchemaId: StageOutputSchemaId;
}>;

export type StageReviewRoleTemplate = Readonly<{
  readonly key: "reviewer";
  readonly title: string;
  readonly responsibilities: readonly string[];
  readonly forbiddenActions: readonly string[];
  readonly mustRead: readonly string[];
  readonly onDemandRead: readonly string[];
  readonly allowedWritePaths: readonly [];
  readonly forbiddenWritePaths: readonly string[];
  readonly outputSchemaId: "stage_review_result_v1";
}>;

export type StageGoalContext = Readonly<{
  readonly id: GoalId;
  readonly title: string;
  readonly boundary: readonly string[];
}>;

export type StageTaskPackage = Readonly<{
  readonly schemaVersion: 1;
  readonly kind: "stage_task_package";
  readonly stageRunId: StageRunId;
  readonly stage: PreflightStage;
  readonly role: StageTaskPackageRole;
  readonly projectIdea: string;
  readonly approvedArtifacts: readonly StageArtifactReference[];
  readonly currentGoal: StageGoalContext | null;
  readonly roleTemplate: PreflightRoleTemplate | StageReviewRoleTemplate;
  readonly outputSchema: StageOutputRule;
  readonly permissions: Readonly<{
    readonly mode: "workspace_write" | "read_only";
    readonly canModifyStageArtifacts: boolean;
  }>;
}>;

export type StageTaskPackageInput = Readonly<{
  readonly stageRunId: StageRunId;
  readonly stage: PreflightStage;
  readonly role: StageTaskPackageRole;
  readonly projectIdea: string;
  readonly approvedArtifacts: readonly StageArtifactReference[];
  readonly currentGoal: StageGoalContext | null;
}>;

const FORMAL_FACT_PATHS = [
  ".personal-workspace/goals",
  ".personal-workspace/tasks",
  ".personal-workspace/approvals",
  ".personal-workspace/audit",
  ".git",
] as const;

const STAGE_OUTPUT_PATHS: Readonly<Record<PreflightStage, string>> = {
  idea: ".personal-workspace/stages/01-idea/01-idea.md",
  discovery: ".personal-workspace/stages/02-discovery/02-discovery.md",
  spec: ".personal-workspace/stages/03-spec/03-spec.md",
  planning: ".personal-workspace/stages/03-spec/planning-draft.md",
};

const STAGE_OUTPUT_RULES: Readonly<
  Record<StageOutputSchemaId, StageOutputRule>
> = {
  stage_coordination_v1: {
    id: "stage_coordination_v1",
    version: 1,
    requiredFields: [
      "schemaVersion",
      "kind",
      "stage",
      "summary",
      "nextAction",
      "handoff",
    ],
    description: "阶段协调建议，不包含批准或正式事实写入。",
  },
  idea_result_v1: {
    id: "idea_result_v1",
    version: 1,
    requiredFields: [
      "schemaVersion",
      "kind",
      "stage",
      "problemStatement",
      "assumptions",
      "openQuestions",
      "artifactRefs",
      "handoff",
    ],
    description: "Idea 阶段的结构化候选产物。",
  },
  discovery_result_v1: {
    id: "discovery_result_v1",
    version: 1,
    requiredFields: [
      "schemaVersion",
      "kind",
      "stage",
      "userScenarios",
      "evidence",
      "risks",
      "decisions",
      "artifactRefs",
      "handoff",
    ],
    description: "Discovery 阶段的结构化验证候选产物。",
  },
  spec_result_v1: {
    id: "spec_result_v1",
    version: 1,
    requiredFields: [
      "schemaVersion",
      "kind",
      "stage",
      "requirements",
      "constraints",
      "validationPlan",
      "artifactRefs",
      "handoff",
    ],
    description: "Spec 阶段的结构化需求候选产物。",
  },
  planning_draft_v1: {
    id: "planning_draft_v1",
    version: 1,
    requiredFields: [
      "schemaVersion",
      "kind",
      "stage",
      "goalDrafts",
      "roleDrafts",
      "taskDrafts",
      "dependencyGraph",
      "handoff",
    ],
    description: "规划阶段的目标、角色和任务草案，不是可执行正式事实。",
  },
  stage_review_result_v1: {
    id: "stage_review_result_v1",
    version: 1,
    requiredFields: [
      "schemaVersion",
      "kind",
      "stage",
      "decision",
      "findings",
      "requiredChanges",
      "verificationEvidence",
      "handoff",
    ],
    description: "只读阶段审核结果，不修改被审核阶段产物。",
  },
};

const REVIEW_ROLE: StageReviewRoleTemplate = {
  key: "reviewer",
  title: "Stage reviewer",
  responsibilities: [
    "inspect stage evidence",
    "decide whether the stage is ready",
  ],
  forbiddenActions: [
    "modify the reviewed stage artifact",
    "approve on behalf of the user",
    "write goals, tasks, or approvals",
  ],
  mustRead: [".personal-workspace/project.md", ".personal-workspace/status.md"],
  onDemandRead: [
    ".personal-workspace/decisions",
    ".personal-workspace/reports",
  ],
  allowedWritePaths: [],
  forbiddenWritePaths: [...FORMAL_FACT_PATHS, ".personal-workspace/stages"],
  outputSchemaId: "stage_review_result_v1",
};

const PREFLIGHT_ROLE_TEMPLATES: readonly PreflightRoleTemplate[] = [
  {
    key: "project-lead",
    title: "Project lead",
    responsibilities: [
      "keep the approved project boundary visible",
      "coordinate stage handoffs",
      "propose the next safe action",
    ],
    forbiddenActions: [
      "approve a stage or goal",
      "write formal goals or tasks before user approval",
      "bind a role to a vendor or session",
    ],
    mustRead: [
      ".personal-workspace/project.md",
      ".personal-workspace/status.md",
      ".personal-workspace/workflow.md",
    ],
    onDemandRead: [
      ".personal-workspace/decisions",
      ".personal-workspace/stages/01-idea/01-idea.md",
    ],
    allowedWritePaths: [".personal-workspace/stages/03-spec/planning-draft.md"],
    forbiddenWritePaths: [...FORMAL_FACT_PATHS],
    outputSchemaId: "stage_coordination_v1",
  },
  {
    key: "idea",
    title: "Idea facilitator",
    responsibilities: [
      "clarify the user's idea",
      "separate assumptions from known facts",
      "record open questions",
    ],
    forbiddenActions: [
      "expand the user's idea into an approved scope",
      "write goals or tasks",
      "approve the Idea stage",
    ],
    mustRead: [
      ".personal-workspace/project.md",
      ".personal-workspace/status.md",
    ],
    onDemandRead: [".personal-workspace/decisions"],
    allowedWritePaths: [STAGE_OUTPUT_PATHS.idea],
    forbiddenWritePaths: [
      ...FORMAL_FACT_PATHS,
      STAGE_OUTPUT_PATHS.discovery,
      STAGE_OUTPUT_PATHS.spec,
      STAGE_OUTPUT_PATHS.planning,
    ],
    outputSchemaId: "idea_result_v1",
  },
  {
    key: "discovery",
    title: "Discovery facilitator",
    responsibilities: [
      "test problem and user scenarios",
      "record evidence and risks",
      "identify unresolved decisions",
    ],
    forbiddenActions: [
      "treat unapproved assumptions as facts",
      "modify the Idea artifact",
      "write goals or tasks",
    ],
    mustRead: [
      ".personal-workspace/project.md",
      STAGE_OUTPUT_PATHS.idea,
      ".personal-workspace/status.md",
    ],
    onDemandRead: [".personal-workspace/decisions"],
    allowedWritePaths: [STAGE_OUTPUT_PATHS.discovery],
    forbiddenWritePaths: [
      ...FORMAL_FACT_PATHS,
      STAGE_OUTPUT_PATHS.idea,
      STAGE_OUTPUT_PATHS.spec,
      STAGE_OUTPUT_PATHS.planning,
    ],
    outputSchemaId: "discovery_result_v1",
  },
  {
    key: "spec",
    title: "Spec facilitator",
    responsibilities: [
      "turn approved discovery evidence into requirements",
      "record constraints and validation plans",
      "identify scope decisions for the user",
    ],
    forbiddenActions: [
      "silently expand scope",
      "modify the Idea or Discovery artifacts",
      "write formal goals or tasks",
    ],
    mustRead: [
      ".personal-workspace/project.md",
      STAGE_OUTPUT_PATHS.idea,
      STAGE_OUTPUT_PATHS.discovery,
    ],
    onDemandRead: [
      ".personal-workspace/decisions",
      ".personal-workspace/approvals",
    ],
    allowedWritePaths: [STAGE_OUTPUT_PATHS.spec],
    forbiddenWritePaths: [
      ...FORMAL_FACT_PATHS,
      STAGE_OUTPUT_PATHS.idea,
      STAGE_OUTPUT_PATHS.discovery,
      STAGE_OUTPUT_PATHS.planning,
    ],
    outputSchemaId: "spec_result_v1",
  },
  {
    key: "planner",
    title: "Planning facilitator",
    responsibilities: [
      "turn an approved Spec into editable planning drafts",
      "build role, task, and dependency proposals",
      "keep drafts non-executable until user approval",
    ],
    forbiddenActions: [
      "write formal goals, roles, or tasks without user approval",
      "start a task from a draft",
      "change the approved Spec",
    ],
    mustRead: [".personal-workspace/project.md", STAGE_OUTPUT_PATHS.spec],
    onDemandRead: [
      ".personal-workspace/decisions",
      ".personal-workspace/roles",
    ],
    allowedWritePaths: [STAGE_OUTPUT_PATHS.planning],
    forbiddenWritePaths: [
      ...FORMAL_FACT_PATHS,
      STAGE_OUTPUT_PATHS.idea,
      STAGE_OUTPUT_PATHS.discovery,
      STAGE_OUTPUT_PATHS.spec,
    ],
    outputSchemaId: "planning_draft_v1",
  },
];

const STAGE_ROLE: Readonly<Record<PreflightStage, PreflightRoleKey>> = {
  idea: "idea",
  discovery: "discovery",
  spec: "spec",
  planning: "planner",
};

function copyTemplate(template: PreflightRoleTemplate): PreflightRoleTemplate {
  return {
    ...template,
    responsibilities: [...template.responsibilities],
    forbiddenActions: [...template.forbiddenActions],
    mustRead: [...template.mustRead],
    onDemandRead: [...template.onDemandRead],
    allowedWritePaths: [...template.allowedWritePaths],
    forbiddenWritePaths: [...template.forbiddenWritePaths],
  };
}

export function createPreflightRoleTemplates(): readonly PreflightRoleTemplate[] {
  return PREFLIGHT_ROLE_TEMPLATES.map(copyTemplate);
}

export function getPreflightRole(
  role: StageTaskPackageRole,
): PreflightRoleTemplate | StageReviewRoleTemplate | undefined {
  if (role === "reviewer") return REVIEW_ROLE;
  const template = PREFLIGHT_ROLE_TEMPLATES.find((item) => item.key === role);
  return template === undefined ? undefined : copyTemplate(template);
}

export function getStageOutputRule(id: StageOutputSchemaId): StageOutputRule {
  const rule = STAGE_OUTPUT_RULES[id];
  return {
    ...rule,
    requiredFields: [...rule.requiredFields],
  };
}

function validArtifactReference(reference: StageArtifactReference): boolean {
  return (
    reference.kind === "approved" &&
    reference.path.trim().length > 0 &&
    Number.isInteger(reference.revision) &&
    reference.revision > 0 &&
    reference.contentHash.trim().length > 0
  );
}

function validGoalContext(goal: StageGoalContext | null): boolean {
  return (
    goal === null ||
    (goal.id.trim().length > 0 &&
      goal.title.trim().length > 0 &&
      goal.boundary.length > 0 &&
      goal.boundary.every((item) => item.trim().length > 0))
  );
}

function roleCanRunStage(
  stage: PreflightStage,
  role: StageTaskPackageRole,
): boolean {
  return (
    role === "reviewer" || role === "project-lead" || STAGE_ROLE[stage] === role
  );
}

export function createStageTaskPackage(
  input: StageTaskPackageInput,
): DomainResult<StageTaskPackage> {
  if (
    input.stageRunId.trim().length === 0 ||
    input.projectIdea.trim().length === 0 ||
    !validGoalContext(input.currentGoal) ||
    !input.approvedArtifacts.every(validArtifactReference) ||
    !roleCanRunStage(input.stage, input.role)
  ) {
    return recordFailure(
      "invalid_stage_run",
      "Stage task package requires bounded context, approved artifacts and a compatible role.",
    );
  }

  const template = getPreflightRole(input.role);
  if (template === undefined) {
    return recordFailure(
      "invalid_stage_run",
      "The requested stage role is undefined.",
    );
  }

  const outputSchema = getStageOutputRule(template.outputSchemaId);
  const reviewer = input.role === "reviewer";
  return {
    ok: true,
    value: {
      schemaVersion: 1,
      kind: "stage_task_package",
      stageRunId: input.stageRunId,
      stage: input.stage,
      role: input.role,
      projectIdea: input.projectIdea.trim(),
      approvedArtifacts: input.approvedArtifacts.map((reference) => ({
        ...reference,
      })),
      currentGoal:
        input.currentGoal === null
          ? null
          : {
              ...input.currentGoal,
              title: input.currentGoal.title.trim(),
              boundary: input.currentGoal.boundary.map((item) => item.trim()),
            },
      roleTemplate: template,
      outputSchema,
      permissions: {
        mode: reviewer ? "read_only" : "workspace_write",
        canModifyStageArtifacts: !reviewer,
      },
    },
  };
}
