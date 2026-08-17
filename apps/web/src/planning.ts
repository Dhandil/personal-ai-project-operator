import type { JsonFetcher } from "./project-initialization";

export type CoordinatedStage = "idea" | "discovery" | "spec";
export type StageRunStatus =
  | "pending"
  | "running"
  | "awaiting_review"
  | "changes_requested"
  | "approved"
  | "blocked"
  | "cancelled"
  | "recovering";

export type FileVersion = Readonly<{
  readonly revision: number;
  readonly hash: string;
}>;

export type StageRun = Readonly<{
  readonly stageRunId: string;
  readonly stage: CoordinatedStage;
  readonly status: StageRunStatus;
  readonly currentRole: string;
  readonly attempt: number;
  readonly executionId: string | null;
  readonly sessionId: string | null;
  readonly phase: "producer" | "reviewer" | null;
  readonly candidateVersion: FileVersion | null;
  readonly reviewVersion: FileVersion | null;
  readonly reviewDecision:
    "accepted" | "changes_requested" | "cancelled" | null;
  readonly artifactRefs: readonly Readonly<{
    readonly path: string;
    readonly revision: number;
    readonly contentHash: string;
    readonly kind: "input" | "candidate" | "approved";
  }>[];
  readonly approvalRef: Readonly<{ readonly approvalId: string }> | null;
  readonly statusReason: string | null;
  readonly revision: number;
  readonly hash: string;
}>;

export type StageState = Readonly<{
  readonly projectRoot: string;
  readonly active: boolean;
  readonly currentStage: CoordinatedStage | null;
  readonly currentRun: StageRun | null;
  readonly runs: readonly StageRun[];
  readonly recoveryRequired: boolean;
  readonly approvalRequired: boolean;
}>;

export type PlanningGoalDraft = Readonly<{
  readonly id: string;
  readonly title: string;
  readonly boundary: readonly string[];
  readonly risks: readonly string[];
  readonly acceptanceCriteria: readonly string[];
}>;

export type PlanningRoleDraft = Readonly<{
  readonly key: string;
  readonly title: string;
  readonly responsibilities: readonly string[];
  readonly mustRead: readonly string[];
  readonly onDemandRead: readonly string[];
  readonly allowedActions: readonly string[];
  readonly forbiddenActions: readonly string[];
  readonly handoff: readonly string[];
}>;

export type PlanningTaskDraft = Readonly<{
  readonly id: string;
  readonly title: string;
  readonly goalId: string;
  readonly currentRole: string;
  readonly dependencies: readonly string[];
  readonly purpose: string;
  readonly scope: readonly string[];
  readonly outputs: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly requiredFiles: readonly string[];
  readonly onDemandFiles: readonly string[];
  readonly allowedPaths: readonly string[];
  readonly forbiddenPaths: readonly string[];
  readonly verificationCommands: readonly string[];
}>;

export type PlanningDraft = Readonly<{
  readonly schemaVersion: 1;
  readonly kind: "planning_draft";
  readonly specRevision: number;
  readonly specHash: string;
  readonly goalDrafts: readonly PlanningGoalDraft[];
  readonly roleDrafts: readonly PlanningRoleDraft[];
  readonly taskDrafts: readonly PlanningTaskDraft[];
  readonly dependencyGraph: Readonly<Record<string, readonly string[]>>;
  readonly handoff: string;
}>;

export type PlanningDraftSnapshot = Readonly<{
  readonly projectKey: string;
  readonly projectRoot: string;
  readonly draft: PlanningDraft;
  readonly status: "candidate" | "rejected" | "approved";
  readonly revision: number;
  readonly hash: string;
}>;

export type PlanningApiError = Readonly<{
  readonly code: string;
  readonly message: string;
  readonly details: readonly string[];
  readonly recoveryPlan?: readonly string[];
}>;

export type PlanningApiResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: PlanningApiError }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVersion(value: unknown): value is FileVersion {
  return (
    isRecord(value) &&
    typeof value.revision === "number" &&
    Number.isInteger(value.revision) &&
    value.revision > 0 &&
    typeof value.hash === "string"
  );
}

function isStageRun(value: unknown): value is StageRun {
  return (
    isRecord(value) &&
    typeof value.stageRunId === "string" &&
    ["idea", "discovery", "spec"].includes(value.stage as string) &&
    typeof value.status === "string" &&
    typeof value.currentRole === "string" &&
    typeof value.attempt === "number" &&
    (value.executionId === null || typeof value.executionId === "string") &&
    (value.sessionId === null || typeof value.sessionId === "string") &&
    (value.phase === null ||
      value.phase === "producer" ||
      value.phase === "reviewer") &&
    (value.candidateVersion === null || isVersion(value.candidateVersion)) &&
    (value.reviewVersion === null || isVersion(value.reviewVersion)) &&
    Array.isArray(value.artifactRefs) &&
    (value.approvalRef === null ||
      (isRecord(value.approvalRef) &&
        typeof value.approvalRef.approvalId === "string")) &&
    typeof value.revision === "number" &&
    typeof value.hash === "string"
  );
}

function parseStageState(value: unknown): StageState | null {
  if (
    !isRecord(value) ||
    typeof value.projectRoot !== "string" ||
    typeof value.active !== "boolean" ||
    (value.currentStage !== null &&
      !["idea", "discovery", "spec"].includes(value.currentStage as string)) ||
    (value.currentRun !== null && !isStageRun(value.currentRun)) ||
    !Array.isArray(value.runs) ||
    !value.runs.every(isStageRun) ||
    typeof value.recoveryRequired !== "boolean" ||
    typeof value.approvalRequired !== "boolean"
  ) {
    return null;
  }
  return value as StageState;
}

function isDraft(value: unknown): value is PlanningDraft {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    value.kind === "planning_draft" &&
    typeof value.specRevision === "number" &&
    typeof value.specHash === "string" &&
    Array.isArray(value.goalDrafts) &&
    Array.isArray(value.roleDrafts) &&
    Array.isArray(value.taskDrafts) &&
    isRecord(value.dependencyGraph) &&
    typeof value.handoff === "string"
  );
}

function parseDraftSnapshot(value: unknown): PlanningDraftSnapshot | null {
  return isRecord(value) &&
    typeof value.projectKey === "string" &&
    typeof value.projectRoot === "string" &&
    isDraft(value.draft) &&
    ["candidate", "rejected", "approved"].includes(value.status as string) &&
    isVersion({ revision: value.revision, hash: value.hash })
    ? (value as PlanningDraftSnapshot)
    : null;
}

function errorFromPayload(value: unknown, status: number): PlanningApiError {
  return isRecord(value) &&
    isRecord(value.error) &&
    typeof value.error.code === "string" &&
    typeof value.error.message === "string" &&
    Array.isArray(value.error.details)
    ? (value.error as PlanningApiError)
    : {
        code: `http_${status}`,
        message: "The planning console service returned an invalid response.",
        details: [],
      };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function request<Value>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  parse: (value: unknown) => Value | null,
  fetcher: JsonFetcher,
  allowNull = false,
): Promise<PlanningApiResult<Value>> {
  try {
    const response = await fetcher(input, init);
    const payload = await readJson(response);
    if (!response.ok || !isRecord(payload) || payload.ok !== true) {
      return { ok: false, error: errorFromPayload(payload, response.status) };
    }
    const value = parse(payload.value);
    return value === null && !allowNull
      ? {
          ok: false,
          error: {
            code: "invalid_response",
            message: "The planning console response has an unexpected shape.",
            details: [],
          },
        }
      : { ok: true, value: value as Value };
  } catch (error: unknown) {
    return {
      ok: false,
      error: {
        code: "network_error",
        message: "Unable to reach the planning console service.",
        details: [error instanceof Error ? error.message : String(error)],
      },
    };
  }
}

function jsonInit(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function requestStageState(
  projectKey: string,
  fetcher: JsonFetcher = fetch,
): Promise<PlanningApiResult<StageState>> {
  return request(
    `/api/projects/stages?projectKey=${encodeURIComponent(projectKey)}`,
    undefined,
    parseStageState,
    fetcher,
  );
}

function stageAction(
  action: "start" | "resume" | "retry" | "cancel",
  input: Readonly<Record<string, unknown>>,
  fetcher: JsonFetcher,
): Promise<PlanningApiResult<StageState>> {
  return request(
    `/api/projects/stages/${action}`,
    jsonInit(input),
    (value) => (isRecord(value) ? parseStageState(value.state) : null),
    fetcher,
  );
}

export function startStage(
  input: Readonly<{ readonly projectKey: string; readonly prompt?: string }>,
  fetcher: JsonFetcher = fetch,
): Promise<PlanningApiResult<StageState>> {
  return stageAction("start", input, fetcher);
}

export function controlStage(
  action: "resume" | "retry" | "cancel",
  input: Readonly<{
    readonly projectKey: string;
    readonly stageRunId?: string;
    readonly executionId?: string;
    readonly note?: string;
  }>,
  fetcher: JsonFetcher = fetch,
): Promise<PlanningApiResult<StageState>> {
  return stageAction(action, input, fetcher);
}

export function decideStage(
  input: Readonly<{
    readonly projectKey: string;
    readonly stageRunId: string;
    readonly decision: "approved" | "changes_requested" | "cancelled";
    readonly note: string;
  }>,
  fetcher: JsonFetcher = fetch,
): Promise<PlanningApiResult<StageState>> {
  return request(
    "/api/projects/stages/decision",
    jsonInit(input),
    (value) => (isRecord(value) ? parseStageState(value.state) : null),
    fetcher,
  );
}

export function requestPlanningDraft(
  projectKey: string,
  fetcher: JsonFetcher = fetch,
): Promise<PlanningApiResult<PlanningDraftSnapshot | null>> {
  return request(
    `/api/projects/planning-draft?projectKey=${encodeURIComponent(projectKey)}`,
    undefined,
    (value) => (value === null ? null : parseDraftSnapshot(value)),
    fetcher,
    true,
  );
}

export function generatePlanningDraft(
  projectKey: string,
  fetcher: JsonFetcher = fetch,
): Promise<PlanningApiResult<PlanningDraftSnapshot>> {
  return request(
    "/api/projects/planning-draft/generate",
    jsonInit({ projectKey }),
    parseDraftSnapshot,
    fetcher,
  );
}

export function editPlanningDraft(
  input: Readonly<{
    readonly projectKey: string;
    readonly revision: number;
    readonly hash: string;
    readonly draft: Partial<PlanningDraft>;
  }>,
  fetcher: JsonFetcher = fetch,
): Promise<PlanningApiResult<PlanningDraftSnapshot>> {
  return request(
    "/api/projects/planning-draft/edit",
    jsonInit(input),
    parseDraftSnapshot,
    fetcher,
  );
}

export function decidePlanningDraft(
  action: "approve" | "reject",
  input: Readonly<{
    readonly projectKey: string;
    readonly revision: number;
    readonly hash: string;
    readonly note: string;
  }>,
  fetcher: JsonFetcher = fetch,
): Promise<
  PlanningApiResult<
    | PlanningDraftSnapshot
    | {
        readonly projectKey: string;
        readonly goalIds: readonly string[];
        readonly taskIds: readonly string[];
        readonly readyTaskId: string;
      }
  >
> {
  return request<
    | PlanningDraftSnapshot
    | {
        readonly projectKey: string;
        readonly goalIds: readonly string[];
        readonly taskIds: readonly string[];
        readonly readyTaskId: string;
      }
  >(
    `/api/projects/planning-draft/${action}`,
    jsonInit(input),
    action === "reject"
      ? parseDraftSnapshot
      : (value) =>
          isRecord(value) &&
          typeof value.projectKey === "string" &&
          Array.isArray(value.goalIds) &&
          value.goalIds.every((item) => typeof item === "string") &&
          Array.isArray(value.taskIds) &&
          value.taskIds.every((item) => typeof item === "string") &&
          typeof value.readyTaskId === "string"
            ? (value as {
                readonly projectKey: string;
                readonly goalIds: readonly string[];
                readonly taskIds: readonly string[];
                readonly readyTaskId: string;
              })
            : null,
    fetcher,
  );
}
