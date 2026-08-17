import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import {
  controlStage,
  decidePlanningDraft,
  decideStage,
  editPlanningDraft,
  generatePlanningDraft,
  requestPlanningDraft,
  requestStageState,
  startStage,
  type PlanningApiError,
  type PlanningDraftSnapshot,
  type StageRun,
  type StageRunStatus,
  type StageState,
} from "./planning";

type ConsoleState =
  | Readonly<{ readonly status: "loading" }>
  | Readonly<{ readonly status: "ready"; readonly value: StageState }>
  | Readonly<{ readonly status: "error"; readonly error: PlanningApiError }>;

type DraftState =
  | Readonly<{ readonly status: "loading" }>
  | Readonly<{
      readonly status: "ready";
      readonly value: PlanningDraftSnapshot | null;
    }>
  | Readonly<{ readonly status: "error"; readonly error: PlanningApiError }>;

const stageLabels: Readonly<Record<string, string>> = {
  idea: "Idea",
  discovery: "Discovery",
  spec: "Spec",
};

const stageDescriptions: Readonly<Record<string, string>> = {
  idea: "澄清问题、假设和开放问题",
  discovery: "验证场景、证据、风险和决策",
  spec: "形成要求、约束和验证计划",
};

export type PlanningConsoleView = "stages" | "draft";

function statusText(status: StageRunStatus): string {
  return {
    pending: "待开始",
    running: "执行中",
    awaiting_review: "待审核",
    changes_requested: "待返工",
    approved: "已批准",
    blocked: "已阻塞",
    cancelled: "已取消，可重新启动",
    recovering: "恢复中",
  }[status];
}

function errorText(error: PlanningApiError): string {
  return error.details.length === 0
    ? error.message
    : `${error.message}：${error.details.join("；")}`;
}

function runForStage(state: StageState, stage: string): StageRun | undefined {
  return state.runs.find((item) => item.stage === stage);
}

function stageVersionText(
  version: Readonly<{
    readonly revision: number;
    readonly hash: string;
  }> | null,
): string {
  return version === null ? "尚无记录" : `revision ${version.revision}`;
}

export function PlanningConsole({
  projectKey,
  view = "stages",
}: Readonly<{
  readonly projectKey: string;
  readonly view?: PlanningConsoleView;
}>): ReactElement {
  const [state, setState] = useState<ConsoleState>({ status: "loading" });
  const [draft, setDraft] = useState<DraftState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [goalTitle, setGoalTitle] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [approvalHandoff, setApprovalHandoff] = useState<{
    readonly goalIds: readonly string[];
    readonly taskIds: readonly string[];
    readonly readyTaskId: string;
  } | null>(null);

  const load = (): void => {
    setState({ status: "loading" });
    setDraft({ status: "loading" });
    void Promise.all([
      requestStageState(projectKey),
      requestPlanningDraft(projectKey),
    ]).then(([stageResult, draftResult]) => {
      setState(
        stageResult.ok
          ? { status: "ready", value: stageResult.value }
          : { status: "error", error: stageResult.error },
      );
      setDraft(
        draftResult.ok
          ? { status: "ready", value: draftResult.value }
          : { status: "error", error: draftResult.error },
      );
      if (draftResult.ok && draftResult.value !== null) {
        setGoalTitle(draftResult.value.draft.goalDrafts[0]?.title ?? "");
      }
    });
  };

  useEffect(() => {
    load();
  }, [projectKey]);

  const action = async (
    operation: "start" | "resume" | "retry" | "cancel",
    run?: StageRun,
  ): Promise<void> => {
    setBusy(true);
    setNotice(null);
    const result =
      operation === "start"
        ? await startStage({ projectKey })
        : await controlStage(operation, {
            projectKey,
            ...(run?.stageRunId === undefined
              ? {}
              : { stageRunId: run.stageRunId }),
            ...(run?.executionId === null || run?.executionId === undefined
              ? {}
              : { executionId: run.executionId }),
            ...(decisionNote.trim().length === 0 ? {} : { note: decisionNote }),
          });
    setBusy(false);
    if (!result.ok) {
      setNotice(errorText(result.error));
      return;
    }
    setNotice(
      operation === "start"
        ? "阶段已启动，状态会从持久化事实重新读取。"
        : `已记录${operation === "cancel" ? "取消" : "恢复"}操作。`,
    );
    setDecisionNote("");
    load();
  };

  const decideRun = async (
    decision: "approved" | "changes_requested" | "cancelled",
    run: StageRun,
  ): Promise<void> => {
    if (decisionNote.trim().length === 0) {
      setNotice("请先填写用户决定理由。 ");
      return;
    }
    setBusy(true);
    setNotice(null);
    const result = await decideStage({
      projectKey,
      stageRunId: run.stageRunId,
      decision,
      note: decisionNote,
    });
    setBusy(false);
    if (!result.ok) {
      setNotice(errorText(result.error));
      return;
    }
    setNotice("用户决定已记录，阶段状态已从事实重新读取。 ");
    setDecisionNote("");
    load();
  };

  const generate = async (): Promise<void> => {
    setBusy(true);
    setNotice(null);
    const result = await generatePlanningDraft(projectKey);
    setBusy(false);
    if (!result.ok) {
      setNotice(errorText(result.error));
      return;
    }
    setDraft({ status: "ready", value: result.value });
    setGoalTitle(result.value.draft.goalDrafts[0]?.title ?? "");
    setNotice("规划草案已生成，仍是候选版本，尚未写入正式目标和任务。 ");
  };

  const saveEdit = async (): Promise<void> => {
    if (draft.status !== "ready" || draft.value === null) return;
    const firstGoal = draft.value.draft.goalDrafts[0];
    if (firstGoal === undefined || goalTitle.trim().length === 0) {
      setNotice("目标标题不能为空。 ");
      return;
    }
    setBusy(true);
    setNotice(null);
    const result = await editPlanningDraft({
      projectKey,
      revision: draft.value.revision,
      hash: draft.value.hash,
      draft: {
        goalDrafts: [{ ...firstGoal, title: goalTitle.trim() }],
      },
    });
    setBusy(false);
    if (!result.ok) {
      setNotice(errorText(result.error));
      return;
    }
    setDraft({ status: "ready", value: result.value });
    setNotice("用户编辑已保存为新的候选版本。 ");
  };

  const decideDraft = async (
    actionName: "approve" | "reject",
  ): Promise<void> => {
    if (draft.status !== "ready" || draft.value === null) return;
    if (decisionNote.trim().length === 0) {
      setNotice("请先填写规划草案的用户决定理由。 ");
      return;
    }
    setBusy(true);
    setNotice(null);
    const result = await decidePlanningDraft(actionName, {
      projectKey,
      revision: draft.value.revision,
      hash: draft.value.hash,
      note: decisionNote,
    });
    setBusy(false);
    if (!result.ok) {
      setNotice(errorText(result.error));
      return;
    }
    if (actionName === "approve" && "readyTaskId" in result.value) {
      setApprovalHandoff({
        goalIds: result.value.goalIds,
        taskIds: result.value.taskIds,
        readyTaskId: result.value.readyTaskId,
      });
    }
    setNotice(
      actionName === "approve"
        ? "规划草案已批准，正式目标和任务已写入；请从事实确认首个 ready 任务。"
        : "规划草案已退回，正式目标和任务未被写入。",
    );
    setDecisionNote("");
    load();
  };

  const currentRun = state.status === "ready" ? state.value.currentRun : null;
  const draftValue = draft.status === "ready" ? draft.value : null;
  const waitingForApproval =
    currentRun?.status === "awaiting_review" &&
    state.status === "ready" &&
    state.value.approvalRequired;

  return (
    <section
      className={`overview-panel planning-console view-${view}`}
      aria-labelledby="planning-console-title"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">V0.3 PLANNING</p>
          <h2 id="planning-console-title">项目前期规划控制台</h2>
        </div>
        <span className="read-only-badge">Agent 只能建议，用户决定</span>
      </div>
      <p className="description">
        从 Idea、Discovery、Spec
        到规划草案批准的单一路径。候选产物、审核结果和正式事实分开显示；刷新或重启后以项目文件恢复。
      </p>

      {busy && (
        <div className="planning-busy" role="status">
          正在处理操作并重新读取项目事实…
        </div>
      )}

      {notice !== null && (
        <div className="overview-alert planning-notice" role="status">
          {notice}
        </div>
      )}

      {state.status === "loading" && (
        <div className="overview-loading">正在读取前期阶段事实…</div>
      )}
      {state.status === "error" && (
        <div className="overview-alert error" role="alert">
          <strong>无法读取前期阶段</strong>
          <p>{errorText(state.error)}</p>
        </div>
      )}
      {state.status === "ready" && (
        <>
          <div className="planning-stage-workspace">
            <div className="planning-summary-grid">
              <div>
                <span className="stage-fact-label">当前阶段</span>
                <strong>
                  {state.value.currentStage === null
                    ? "尚未启动"
                    : stageLabels[state.value.currentStage]}
                </strong>
              </div>
              <div>
                <span className="stage-fact-label">执行链</span>
                <strong>{state.value.active ? "执行中" : "空闲"}</strong>
              </div>
              <div>
                <span className="stage-fact-label">正式事实</span>
                <strong>
                  {currentRun?.artifactRefs.filter(
                    (item) => item.kind === "approved",
                  ).length ?? 0}{" "}
                  个已批准产物
                </strong>
              </div>
              <div>
                <span className="stage-fact-label">恢复</span>
                <strong>
                  {state.value.recoveryRequired ? "需要用户决定" : "无需恢复"}
                </strong>
              </div>
            </div>

            <div className="planning-stage-grid" aria-label="前期阶段进度">
              {(["idea", "discovery", "spec"] as const).map((stage) => {
                const run = runForStage(state.value, stage);
                return (
                  <article
                    className={`planning-stage-card ${state.value.currentStage === stage ? "current" : ""}`}
                    key={stage}
                  >
                    <div className="workflow-stage-heading">
                      <h3>{stageLabels[stage]}</h3>
                      <span
                        className={`stage-status ${run?.status ?? "draft"}`}
                      >
                        {run === undefined ? "待开始" : statusText(run.status)}
                      </span>
                    </div>
                    <p>{stageDescriptions[stage]}</p>
                    {run !== undefined && (
                      <dl className="planning-facts">
                        <div>
                          <dt>责任角色</dt>
                          <dd>{run.currentRole}</dd>
                        </div>
                        <div>
                          <dt>运行 ID</dt>
                          <dd>
                            <code>{run.stageRunId}</code>
                          </dd>
                        </div>
                        <div>
                          <dt>候选产物</dt>
                          <dd>{stageVersionText(run.candidateVersion)}</dd>
                        </div>
                        <div>
                          <dt>审核结果</dt>
                          <dd>{run.reviewDecision ?? "尚无"}</dd>
                        </div>
                      </dl>
                    )}
                  </article>
                );
              })}
            </div>

            {currentRun?.statusReason !== null &&
              currentRun?.statusReason !== undefined && (
                <p className="planning-status-reason">
                  状态说明：{currentRun.statusReason}
                </p>
              )}

            <div className="wizard-actions planning-actions">
              {currentRun === null || currentRun.status === "approved" ? (
                <button
                  className="button primary"
                  type="button"
                  onClick={() => void action("start")}
                  disabled={busy}
                >
                  {currentRun === null ? "启动 Idea 阶段" : "启动下一阶段"}
                </button>
              ) : null}
              {currentRun?.status === "cancelled" && (
                <button
                  className="button primary"
                  type="button"
                  onClick={() => void action("start", currentRun)}
                  disabled={busy}
                >
                  重新启动当前阶段
                </button>
              )}
              {(currentRun?.status === "blocked" ||
                currentRun?.status === "recovering") && (
                <button
                  className="button primary"
                  type="button"
                  onClick={() => void action("resume", currentRun)}
                  disabled={busy}
                >
                  恢复当前阶段
                </button>
              )}
              {(currentRun?.status === "blocked" ||
                currentRun?.status === "changes_requested") && (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => void action("retry", currentRun)}
                  disabled={busy}
                >
                  重新执行阶段
                </button>
              )}
              {(state.value.active ||
                currentRun?.status === "blocked" ||
                currentRun?.status === "recovering") &&
                currentRun !== null && (
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => void action("cancel", currentRun)}
                    disabled={busy}
                  >
                    取消当前阶段
                  </button>
                )}
            </div>

            {waitingForApproval && currentRun !== null && (
              <div className="planning-decision-panel">
                <h3>阶段审核门</h3>
                <p>
                  审核结果已产生，必须由用户批准、退回返工或取消；不会自动推进下一阶段。
                </p>
                <div className="wizard-actions">
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() =>
                      void decideRun("changes_requested", currentRun)
                    }
                    disabled={busy}
                  >
                    退回返工
                  </button>
                  <button
                    className="button primary"
                    type="button"
                    onClick={() => void decideRun("approved", currentRun)}
                    disabled={busy}
                  >
                    批准阶段产物
                  </button>
                </div>
              </div>
            )}

            <label className="decision-reason">
              用户决定或恢复理由
              <textarea
                value={decisionNote}
                onChange={(event) => setDecisionNote(event.target.value)}
                placeholder="说明批准、退回、取消或恢复原因"
              />
            </label>
          </div>
          {view === "draft" && (
            <label className="decision-reason draft-decision-reason">
              用户决定或恢复理由
              <textarea
                value={decisionNote}
                onChange={(event) => setDecisionNote(event.target.value)}
                placeholder="说明批准或退回规划草案的原因"
              />
            </label>
          )}
        </>
      )}

      <div className="planning-draft-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">PLANNING DRAFT</p>
            <h3>目标、角色与任务草案</h3>
          </div>
          {draftValue !== null && (
            <span className={`stage-status ${draftValue.status}`}>
              {draftValue.status === "candidate"
                ? "候选版本"
                : draftValue.status === "approved"
                  ? "正式版本"
                  : "已退回"}
            </span>
          )}
        </div>
        {draft.status === "loading" && (
          <div className="overview-loading">正在读取规划草案…</div>
        )}
        {draft.status === "error" && (
          <div className="overview-alert error" role="alert">
            <p>{errorText(draft.error)}</p>
          </div>
        )}
        {draft.status === "ready" && draft.value === null && (
          <div className="planning-empty-state">
            <p>
              尚未生成规划草案。生成操作只创建候选版本，不会写入正式目标或任务。
            </p>
            <button
              className="button secondary"
              type="button"
              onClick={() => void generate()}
              disabled={busy}
            >
              从已批准 Spec 生成草案
            </button>
          </div>
        )}
        {draftValue !== null && (
          <>
            <div className="planning-draft-meta">
              <span>Spec revision {draftValue.draft.specRevision}</span>
              <span>草案 revision {draftValue.revision}</span>
              <span>目标 {draftValue.draft.goalDrafts.length}</span>
              <span>角色 {draftValue.draft.roleDrafts.length}</span>
              <span>任务 {draftValue.draft.taskDrafts.length}</span>
            </div>
            <label className="planning-edit-field">
              目标标题（用户可编辑）
              <input
                value={goalTitle}
                onChange={(event) => setGoalTitle(event.target.value)}
                disabled={draftValue.status === "approved"}
              />
            </label>
            <div className="wizard-actions">
              {draftValue.status === "candidate" && (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => void saveEdit()}
                  disabled={busy}
                >
                  保存草案编辑
                </button>
              )}
              {draftValue.status === "candidate" && (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => void decideDraft("reject")}
                  disabled={busy}
                >
                  退回规划草案
                </button>
              )}
              {draftValue.status === "candidate" && (
                <button
                  className="button primary"
                  type="button"
                  onClick={() => void decideDraft("approve")}
                  disabled={busy}
                >
                  批准并写入正式事实
                </button>
              )}
            </div>
            <div className="planning-draft-columns">
              <section aria-labelledby="planning-roles-title">
                <h4 id="planning-roles-title">角色模板</h4>
                <ul className="planning-list">
                  {draftValue.draft.roleDrafts.map((role) => (
                    <li key={role.key}>
                      <strong>{role.title}</strong>
                      <span>
                        {role.key} · 允许：{role.allowedActions.join("、")}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
              <section aria-labelledby="planning-tasks-title">
                <h4 id="planning-tasks-title">任务依赖与验收</h4>
                <ul className="planning-list">
                  {draftValue.draft.taskDrafts.map((task) => (
                    <li key={task.id}>
                      <strong>
                        {task.id} · {task.title}
                      </strong>
                      <span>依赖：{task.dependencies.join("、") || "无"}</span>
                      <span>
                        角色：{task.currentRole} · 验收：
                        {task.acceptanceCriteria.join("；")}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </>
        )}
      </div>
      {approvalHandoff !== null && (
        <div className="planning-handoff" role="status">
          <strong>批准后的交接入口</strong>
          <span>
            目标：{approvalHandoff.goalIds.join("、")}；首个 Ready 任务：
            {approvalHandoff.readyTaskId}
          </span>
          <div className="wizard-actions">
            <a className="button secondary" href="/projects/goals">
              查看目标
            </a>
            <a className="button secondary" href="/projects/tasks">
              查看任务
            </a>
            <a className="button primary" href="/projects/execution">
              打开执行控制台
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
