export const DEFAULT_STAGE_DEFINITIONS = [
  { key: "idea-clarification", title: "想法澄清" },
  { key: "problem-definition", title: "问题定义" },
  { key: "user-scenarios", title: "用户场景" },
  { key: "discovery-validation", title: "Discovery 验证" },
  { key: "product-requirements", title: "产品需求" },
  { key: "mvp-scope", title: "MVP 范围" },
  { key: "system-design", title: "系统方案" },
  { key: "development-plan", title: "开发计划" },
  { key: "first-short-term-goal", title: "第一个短期目标" },
  { key: "execution", title: "执行" },
] as const;

export type StageKey = (typeof DEFAULT_STAGE_DEFINITIONS)[number]["key"];
export type StageStatus = "draft" | "in_progress" | "completed" | "skipped";

export type Stage = Readonly<{
  readonly key: StageKey;
  readonly title: string;
  readonly order: number;
  readonly status: StageStatus;
  readonly skipReason?: string;
}>;

export type Workflow = Readonly<{
  readonly stages: readonly Stage[];
  readonly currentStage: StageKey | null;
}>;

export type DomainErrorCode =
  | "invalid_stage"
  | "invalid_stage_order"
  | "invalid_stage_transition"
  | "reason_required"
  | "user_decision_required";

export type DomainError = Readonly<{
  readonly code: DomainErrorCode;
  readonly message: string;
}>;

export type DomainResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: DomainError }>;

export type StageSkipProposal = Readonly<{
  readonly stageKey: StageKey;
  readonly proposedBy: "agent";
  readonly rationale: string;
}>;

export type UserSkipDecision = Readonly<{
  readonly decidedBy: "user";
  readonly approved: boolean;
  readonly reason: string;
}>;

function success<Value>(value: Value): DomainResult<Value> {
  return { ok: true, value };
}

function failure<Value>(
  code: DomainErrorCode,
  message: string,
): DomainResult<Value> {
  return { ok: false, error: { code, message } };
}

function findStage(workflow: Workflow, stageKey: StageKey): Stage | undefined {
  return workflow.stages.find((stage) => stage.key === stageKey);
}

function findCurrentStage(stages: readonly Stage[]): StageKey | null {
  return (
    stages.find(
      (stage) => stage.status === "draft" || stage.status === "in_progress",
    )?.key ?? null
  );
}

function replaceStage(
  workflow: Workflow,
  stageKey: StageKey,
  update: (stage: Stage) => Stage,
): Workflow {
  const stages = workflow.stages.map((stage) =>
    stage.key === stageKey ? update(stage) : stage,
  );

  return {
    stages,
    currentStage: findCurrentStage(stages),
  };
}

export function createDefaultWorkflow(): Workflow {
  const stages = DEFAULT_STAGE_DEFINITIONS.map((definition, index) => ({
    ...definition,
    order: index + 1,
    status: "draft" as const,
  }));

  return {
    stages,
    currentStage: stages[0]?.key ?? null,
  };
}

export function startStage(
  workflow: Workflow,
  stageKey: StageKey,
): DomainResult<Workflow> {
  const stage = findStage(workflow, stageKey);
  if (stage === undefined) {
    return failure("invalid_stage", `阶段不存在：${stageKey}`);
  }

  if (workflow.currentStage !== stageKey) {
    return failure("invalid_stage_order", "只能按默认阶段顺序启动当前阶段");
  }

  if (stage.status !== "draft") {
    return failure("invalid_stage_transition", "只有 draft 阶段可以启动");
  }

  return success(
    replaceStage(workflow, stageKey, (current) => ({
      key: current.key,
      title: current.title,
      order: current.order,
      status: "in_progress",
    })),
  );
}

export function completeStage(
  workflow: Workflow,
  stageKey: StageKey,
): DomainResult<Workflow> {
  const stage = findStage(workflow, stageKey);
  if (stage === undefined) {
    return failure("invalid_stage", `阶段不存在：${stageKey}`);
  }

  if (workflow.currentStage !== stageKey) {
    return failure("invalid_stage_order", "只能按默认阶段顺序完成当前阶段");
  }

  if (stage.status !== "in_progress") {
    return failure("invalid_stage_transition", "只有 in_progress 阶段可以完成");
  }

  return success(
    replaceStage(workflow, stageKey, (current) => ({
      key: current.key,
      title: current.title,
      order: current.order,
      status: "completed",
    })),
  );
}

export function suggestStageSkip(
  workflow: Workflow,
  stageKey: StageKey,
  rationale: string,
): DomainResult<StageSkipProposal> {
  const stage = findStage(workflow, stageKey);
  if (stage === undefined) {
    return failure("invalid_stage", `阶段不存在：${stageKey}`);
  }

  if (workflow.currentStage !== stageKey) {
    return failure("invalid_stage_order", "只能为当前阶段提出跳过建议");
  }

  if (rationale.trim().length === 0) {
    return failure("reason_required", "跳过建议必须包含理由");
  }

  return success({
    stageKey,
    proposedBy: "agent",
    rationale: rationale.trim(),
  });
}

export function applyStageSkipDecision(
  workflow: Workflow,
  proposal: StageSkipProposal,
  decision: UserSkipDecision,
): DomainResult<Workflow> {
  const stage = findStage(workflow, proposal.stageKey);
  if (stage === undefined) {
    return failure("invalid_stage", `阶段不存在：${proposal.stageKey}`);
  }

  if (decision.decidedBy !== "user") {
    return failure("user_decision_required", "只有用户可以记录阶段跳过");
  }

  if (!decision.approved) {
    return success(workflow);
  }

  if (decision.reason.trim().length === 0) {
    return failure("reason_required", "用户批准跳过时必须保留理由");
  }

  if (workflow.currentStage !== proposal.stageKey) {
    return failure("invalid_stage_order", "只能跳过当前阶段");
  }

  if (stage.status !== "draft") {
    return failure("invalid_stage_transition", "只有 draft 阶段可以被跳过");
  }

  return success(
    replaceStage(workflow, proposal.stageKey, (current) => ({
      key: current.key,
      title: current.title,
      order: current.order,
      status: "skipped",
      skipReason: decision.reason.trim(),
    })),
  );
}
