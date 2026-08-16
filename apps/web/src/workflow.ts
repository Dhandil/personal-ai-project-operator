import type { JsonFetcher } from "./project-initialization";

export type WorkflowStageKey =
  | "idea-clarification"
  | "problem-definition"
  | "user-scenarios"
  | "discovery-validation"
  | "product-requirements"
  | "mvp-scope"
  | "system-design"
  | "development-plan"
  | "first-short-term-goal"
  | "execution";

const workflowStageKeys: readonly WorkflowStageKey[] = [
  "idea-clarification",
  "problem-definition",
  "user-scenarios",
  "discovery-validation",
  "product-requirements",
  "mvp-scope",
  "system-design",
  "development-plan",
  "first-short-term-goal",
  "execution",
];

export type WorkflowStage = Readonly<{
  readonly key: WorkflowStageKey;
  readonly title: string;
  readonly order: number;
  readonly status: "draft" | "in_progress" | "completed" | "skipped";
  readonly skipReason?: string;
  readonly artifacts: readonly Readonly<{
    readonly relativePath: string;
    readonly state: "available" | "missing";
  }>[];
}>;

export type WorkflowPayload = Readonly<{
  readonly projectKey: string;
  readonly projectRoot: string;
  readonly revision: number;
  readonly currentStage: WorkflowStageKey | null;
  readonly stages: readonly WorkflowStage[];
}>;

export type WorkflowGuide = Readonly<{
  readonly purpose: string;
  readonly primaryAction: string;
  readonly readArtifacts: readonly string[];
  readonly nextStep: string;
  readonly nextHref?: string;
}>;

export const workflowGuides: Readonly<Record<WorkflowStageKey, WorkflowGuide>> =
  {
    "idea-clarification": {
      purpose: "把项目想法收敛为清晰方向和需要继续核对的假设。",
      primaryAction: "先阅读想法澄清材料，补充仍然模糊的方向。",
      readArtifacts: [".personal-workspace/stages/01-idea/01-idea.md"],
      nextStep: "确认方向后进入问题定义；不需要上传阶段文件。",
    },
    "problem-definition": {
      purpose: "核对要解决的问题、边界和已有事实。",
      primaryAction: "阅读 Discovery 材料，确认 Problem Statement 和范围。",
      readArtifacts: [
        ".personal-workspace/stages/01-idea/01-idea.md",
        ".personal-workspace/stages/02-discovery/02-discovery.md",
      ],
      nextStep: "问题边界稳定后整理用户场景。",
    },
    "user-scenarios": {
      purpose: "从已确认的问题整理用户、触发条件和期望结果。",
      primaryAction: "在共用的 Discovery 材料中补充用户场景，不创建重复文件。",
      readArtifacts: [
        ".personal-workspace/stages/02-discovery/02-discovery.md",
      ],
      nextStep: "场景和边界核对后进入 Discovery 验证。",
    },
    "discovery-validation": {
      purpose: "核对证据、未决问题和继续推进的风险。",
      primaryAction: "阅读 Discovery 决定和验证记录，明确仍需补证的内容。",
      readArtifacts: [
        ".personal-workspace/stages/02-discovery/02-discovery.md",
      ],
      nextStep: "材料不足时由 Agent 提出跳过建议，是否跳过必须由用户决定。",
    },
    "product-requirements": {
      purpose: "把已确认的问题和场景转化为正式产品需求。",
      primaryAction: "阅读并更新正式开发 Spec 的产品行为部分。",
      readArtifacts: [".personal-workspace/stages/03-spec/03-spec.md"],
      nextStep: "需求边界稳定后继续核对 MVP 范围。",
    },
    "mvp-scope": {
      purpose: "明确首个可验证切片的范围和明确不做的内容。",
      primaryAction: "在正式开发 Spec 中核对 MVP 范围。",
      readArtifacts: [".personal-workspace/stages/03-spec/03-spec.md"],
      nextStep: "范围确定后进入系统方案。",
    },
    "system-design": {
      purpose: "形成与已批准范围匹配的系统方案。",
      primaryAction: "阅读正式 Spec，核对技术方案与约束。",
      readArtifacts: [".personal-workspace/stages/03-spec/03-spec.md"],
      nextStep: "方案需要承诺时保留用户审批门。",
    },
    "development-plan": {
      purpose: "把方案拆成可验证、可交接的开发计划。",
      primaryAction: "在正式 Spec 中核对开发计划、验证命令和交接要求。",
      readArtifacts: [".personal-workspace/stages/03-spec/03-spec.md"],
      nextStep: "计划清晰后提出第一个短期目标。",
    },
    "first-short-term-goal": {
      purpose: "定义边界清晰、可审批的第一个短期目标。",
      primaryAction: "阅读 Spec 并检查目标、角色、任务和审批边界。",
      readArtifacts: [".personal-workspace/stages/03-spec/03-spec.md"],
      nextStep: "批准短期目标后进入目标任务执行。",
      nextHref: "/projects/goals",
    },
    execution: {
      purpose: "在已批准的目标和任务边界内执行、审核和交接。",
      primaryAction: "打开执行控制台，查看当前执行链和下一项恢复或审核动作。",
      readArtifacts: [".personal-workspace/stages/03-spec/03-spec.md"],
      nextStep: "由用户启动或恢复执行；没有真实 Agent 时不会伪装成自动执行。",
      nextHref: "/projects/execution",
    },
  } as const;

export type SkipExplanation = Readonly<{
  readonly material: readonly string[];
  readonly missing: readonly string[];
  readonly risks: readonly string[];
}>;

export type SkipProposal = Readonly<{
  readonly projectKey: string;
  readonly proposal: Readonly<{
    readonly stageKey: string;
    readonly proposedBy: "agent";
    readonly rationale: string;
  }>;
  readonly explanation: SkipExplanation;
  readonly workflow: WorkflowPayload;
}>;

export type SkipDecision = Readonly<{
  readonly projectKey: string;
  readonly changed: boolean;
  readonly decision: Readonly<{
    readonly decidedBy: "user";
    readonly approved: boolean;
    readonly reason: string;
  }>;
  readonly workflow: WorkflowPayload;
}>;

export type WorkflowApiError = Readonly<{
  readonly code: string;
  readonly message: string;
  readonly details: readonly string[];
}>;

export type WorkflowApiResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: WorkflowApiError }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWorkflowStageKey(value: unknown): value is WorkflowStageKey {
  return (
    typeof value === "string" &&
    workflowStageKeys.includes(value as WorkflowStageKey)
  );
}

function isStage(value: unknown): value is WorkflowStage {
  if (!isRecord(value) || !Array.isArray(value.artifacts)) {
    return false;
  }
  return (
    isWorkflowStageKey(value.key) &&
    typeof value.title === "string" &&
    typeof value.order === "number" &&
    ["draft", "in_progress", "completed", "skipped"].includes(
      value.status as string,
    ) &&
    value.artifacts.every(
      (artifact) =>
        isRecord(artifact) &&
        typeof artifact.relativePath === "string" &&
        (artifact.state === "available" || artifact.state === "missing"),
    )
  );
}

export function parseWorkflowPayload(value: unknown): WorkflowPayload | null {
  if (!isRecord(value) || !Array.isArray(value.stages)) {
    return null;
  }
  if (
    typeof value.projectKey !== "string" ||
    typeof value.projectRoot !== "string" ||
    typeof value.revision !== "number" ||
    (value.currentStage !== null && !isWorkflowStageKey(value.currentStage)) ||
    !value.stages.every(isStage)
  ) {
    return null;
  }
  return value as WorkflowPayload;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorFromPayload(value: unknown, status: number): WorkflowApiError {
  if (
    isRecord(value) &&
    isRecord(value.error) &&
    typeof value.error.code === "string" &&
    typeof value.error.message === "string" &&
    Array.isArray(value.error.details) &&
    value.error.details.every((detail) => typeof detail === "string")
  ) {
    return value.error as WorkflowApiError;
  }
  return {
    code: `http_${status}`,
    message: "服务返回了无法识别的工作流结果。",
    details: [],
  };
}

async function request<Value>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  parse: (value: unknown) => Value | null,
  invalidMessage: string,
  fetcher: JsonFetcher,
): Promise<WorkflowApiResult<Value>> {
  try {
    const response = await fetcher(input, init);
    const payload = await readJson(response);
    if (!response.ok || !isRecord(payload) || payload.ok !== true) {
      return { ok: false, error: errorFromPayload(payload, response.status) };
    }
    const value = parse(payload.value);
    return value === null
      ? {
          ok: false,
          error: {
            code: "invalid_response",
            message: invalidMessage,
            details: [],
          },
        }
      : { ok: true, value };
  } catch (error: unknown) {
    return {
      ok: false,
      error: {
        code: "network_error",
        message: "无法连接工作流服务。",
        details: [error instanceof Error ? error.message : String(error)],
      },
    };
  }
}

function parseSkipExplanation(value: unknown): SkipExplanation | null {
  if (!isRecord(value)) return null;
  const keys = ["material", "missing", "risks"] as const;
  return keys.every(
    (key) =>
      Array.isArray(value[key]) &&
      value[key].every((item) => typeof item === "string"),
  )
    ? (value as SkipExplanation)
    : null;
}

function parseSkipProposal(value: unknown): SkipProposal | null {
  if (!isRecord(value) || parseWorkflowPayload(value.workflow) === null)
    return null;
  const proposal = value.proposal;
  const explanation = parseSkipExplanation(value.explanation);
  return isRecord(proposal) &&
    typeof value.projectKey === "string" &&
    typeof proposal.stageKey === "string" &&
    proposal.proposedBy === "agent" &&
    typeof proposal.rationale === "string" &&
    explanation !== null
    ? (value as SkipProposal)
    : null;
}

function parseSkipDecision(value: unknown): SkipDecision | null {
  if (!isRecord(value) || parseWorkflowPayload(value.workflow) === null)
    return null;
  const decision = value.decision;
  return isRecord(decision) &&
    typeof value.projectKey === "string" &&
    typeof value.changed === "boolean" &&
    decision.decidedBy === "user" &&
    typeof decision.approved === "boolean" &&
    typeof decision.reason === "string"
    ? (value as SkipDecision)
    : null;
}

export function requestWorkflow(
  projectKey: string,
  fetcher: JsonFetcher = fetch,
): Promise<WorkflowApiResult<WorkflowPayload>> {
  return request(
    `/api/projects/workflow?projectKey=${encodeURIComponent(projectKey)}`,
    undefined,
    parseWorkflowPayload,
    "工作流响应格式不正确。",
    fetcher,
  );
}

export function requestSkipProposal(
  input: Readonly<{
    readonly projectKey: string;
    readonly stageKey: string;
    readonly material: readonly string[];
    readonly missing: readonly string[];
    readonly risks: readonly string[];
  }>,
  fetcher: JsonFetcher = fetch,
): Promise<WorkflowApiResult<SkipProposal>> {
  return request(
    "/api/projects/workflow/skip-proposal",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectKey: input.projectKey,
        stageKey: input.stageKey,
        explanation: {
          material: input.material,
          missing: input.missing,
          risks: input.risks,
        },
      }),
    },
    parseSkipProposal,
    "跳过建议响应格式不正确。",
    fetcher,
  );
}

export function requestSkipDecision(
  input: Readonly<{
    readonly projectKey: string;
    readonly proposal: SkipProposal["proposal"];
    readonly approved: boolean;
    readonly reason: string;
  }>,
  fetcher: JsonFetcher = fetch,
): Promise<WorkflowApiResult<SkipDecision>> {
  return request(
    "/api/projects/workflow/skip-decision",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectKey: input.projectKey,
        proposal: input.proposal,
        decision: {
          decidedBy: "user",
          approved: input.approved,
          reason: input.reason,
        },
      }),
    },
    parseSkipDecision,
    "跳过决定响应格式不正确。",
    fetcher,
  );
}
