import type { JsonFetcher } from "./project-initialization";

export type WorkflowStage = Readonly<{
  readonly key: string;
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
  readonly currentStage: string | null;
  readonly stages: readonly WorkflowStage[];
}>;

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

function isStage(value: unknown): value is WorkflowStage {
  if (!isRecord(value) || !Array.isArray(value.artifacts)) {
    return false;
  }
  return (
    typeof value.key === "string" &&
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
    (typeof value.currentStage !== "string" && value.currentStage !== null) ||
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
