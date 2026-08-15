import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { requestProjectList } from "./project-overview";
import {
  requestReports,
  subscribeToProjectEvents,
  type ExecutionReport,
} from "./report";
import {
  requestExecutionAction,
  requestExecutionState,
  type ExecutionAction,
  type ExecutionApiError,
  type ExecutionRun,
  type ExecutionState,
} from "./execution";

type PageState =
  | Readonly<{ readonly status: "loading" }>
  | Readonly<{ readonly status: "error"; readonly error: ExecutionApiError }>
  | Readonly<{
      readonly status: "ready";
      readonly projectKey: string;
      readonly execution: ExecutionState;
      readonly reports: readonly ExecutionReport[];
      readonly connection: "connecting" | "connected" | "reconnecting";
    }>;

function errorText(error: ExecutionApiError): string {
  return error.details.length === 0
    ? error.message
    : `${error.message} (${error.details.join(", ")})`;
}

function statusText(run: ExecutionRun): string {
  if (run.taskStatus === "blocked") return "已阻塞";
  if (run.taskStatus === "paused") return "已暂停，等待恢复决策";
  if (run.taskStatus === "changes_requested") return "需要返工";
  if (run.taskStatus === "cancelled") return "已取消";
  if (run.taskStatus === "in_review") return "Agent 已完成，等待审核";
  if (run.taskStatus === "completed") return "任务已完成";
  if (run.status === "failed") return "执行失败";
  if (run.status === "interrupted") return "执行中断，需要恢复";
  if (run.status === "privilege_violation") return "权限校验阻断";
  return "执行中";
}

function statusClass(run: ExecutionRun): string {
  if (run.taskStatus === "blocked" || run.status === "failed") return "failed";
  if (run.taskStatus === "paused" || run.status === "interrupted")
    return "recovery";
  if (run.taskStatus === "completed") return "completed";
  if (run.taskStatus === "in_review") return "review";
  return "running";
}

function dateText(value: string | null): string {
  if (value === null) return "未结束";
  return new Date(value).toLocaleString("zh-CN");
}

function resultSummary(run: ExecutionRun): string | null {
  const summary = run.result?.summary;
  return typeof summary === "string" ? summary : null;
}

export function ExecutionConsolePage(): ReactElement {
  const [state, setState] = useState<PageState>({ status: "loading" });
  const [busyAction, setBusyAction] = useState<ExecutionAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = (): void => {
    setState({ status: "loading" });
    setNotice(null);
    void requestProjectList().then((projects) => {
      if (!projects.ok) {
        setState({ status: "error", error: projects.error });
        return;
      }
      const projectKey = projects.value.currentProjectKey;
      if (projectKey === null) {
        setState({
          status: "error",
          error: {
            code: "selection_required",
            message: "请先选择当前项目。",
            details: [],
          },
        });
        return;
      }
      void Promise.all([
        requestExecutionState(projectKey),
        requestReports(projectKey),
      ]).then(([execution, reports]) => {
        if (!execution.ok) {
          setState({ status: "error", error: execution.error });
          return;
        }
        if (!reports.ok) {
          setState({ status: "error", error: reports.error });
          return;
        }
        setState({
          status: "ready",
          projectKey,
          execution: execution.value,
          reports: reports.value.reports,
          connection: "connecting",
        });
      });
    });
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (state.status !== "ready") return;
    let lastEventId: string | null = null;
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connect = (): void => {
      if (disposed) return;
      setState((current) =>
        current.status === "ready"
          ? { ...current, connection: "connecting" }
          : current,
      );
      source = subscribeToProjectEvents(
        state.projectKey,
        (event) => {
          lastEventId = event.id || lastEventId;
          setState((current) => {
            if (current.status !== "ready") return current;
            if (current.reports.some((report) => report.id === event.data.id))
              return { ...current, connection: "connected" };
            return {
              ...current,
              connection: "connected",
              reports: [...current.reports, event.data],
            };
          });
        },
        lastEventId,
      );
      source.onopen = () => {
        setState((current) =>
          current.status === "ready"
            ? { ...current, connection: "connected" }
            : current,
        );
      };
      source.onerror = () => {
        source?.close();
        source = null;
        if (disposed) return;
        setState((current) =>
          current.status === "ready"
            ? { ...current, connection: "reconnecting" }
            : current,
        );
        if (reconnectTimer === null)
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
          }, 500);
      };
    };

    connect();
    return () => {
      disposed = true;
      source?.close();
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    };
  }, [state.status === "ready" ? state.projectKey : null]);

  const chooseRecovery = (action: ExecutionAction): void => {
    if (state.status !== "ready" || state.execution.run === null) return;
    setBusyAction(action);
    setNotice(null);
    void requestExecutionAction({
      projectKey: state.projectKey,
      executionId: state.execution.run.executionId,
      action,
    }).then((result) => {
      setBusyAction(null);
      if (!result.ok) {
        setNotice(errorText(result.error));
        return;
      }
      setNotice(
        action === "resume"
          ? "已记录恢复执行决定。"
          : action === "retry"
            ? "已记录重新执行决定。"
            : "已记录取消执行决定。",
      );
      setState((current) =>
        current.status !== "ready"
          ? current
          : {
              ...current,
              execution: {
                active: action !== "cancel",
                run: result.value.run,
                recovery: result.value.run.recovery,
              },
            },
      );
    });
  };

  const recovery =
    state.status === "ready"
      ? (state.execution.recovery ?? state.execution.run?.recovery ?? null)
      : null;

  return (
    <section
      className="overview-shell execution-console"
      aria-labelledby="execution-console-title"
    >
      <a className="back-link" href="/">
        ← 返回项目概览
      </a>
      <div className="overview-intro">
        <p className="eyebrow">EXECUTION CONSOLE</p>
        <h1 id="execution-console-title">执行控制台</h1>
        <p className="description">
          查看当前执行链、实时进度和可恢复决策。页面重开后仍从持久化执行记录恢复。
        </p>
      </div>

      {state.status === "loading" && (
        <div className="overview-loading" role="status">
          正在加载执行状态…
        </div>
      )}
      {state.status === "error" && (
        <div className="overview-alert error" role="alert">
          {errorText(state.error)}
          <button className="button secondary" type="button" onClick={load}>
            重试
          </button>
        </div>
      )}
      {state.status === "ready" && (
        <>
          <div className="panel-heading execution-toolbar">
            <div>
              <p className="eyebrow">CURRENT PROJECT</p>
              <code>{state.projectKey}</code>
            </div>
            <div className="execution-toolbar-actions">
              <span className={`execution-connection ${state.connection}`}>
                {state.connection === "connected"
                  ? "实时连接正常"
                  : state.connection === "reconnecting"
                    ? "实时连接重连中"
                    : "实时连接建立中"}
              </span>
              <button className="button secondary" type="button" onClick={load}>
                刷新
              </button>
            </div>
          </div>

          {state.execution.run === null ? (
            <div className="empty-projects execution-empty">
              <h2>暂无执行记录</h2>
              <p>当前项目还没有可展示的执行。没有报告时不会显示为已完成。</p>
            </div>
          ) : (
            <>
              <section
                className={`overview-panel execution-status-banner ${statusClass(state.execution.run)}`}
                aria-live="polite"
              >
                <div>
                  <p className="eyebrow">EXECUTION STATE</p>
                  <h2>{statusText(state.execution.run)}</h2>
                  <p>
                    {state.execution.active
                      ? "执行链仍处于活动状态。"
                      : "执行链当前未运行，状态来自已持久化事实。"}
                  </p>
                </div>
                <span className="stage-status">
                  {state.execution.run.status}
                </span>
              </section>

              <section
                className="overview-panel"
                aria-labelledby="execution-summary-title"
              >
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">PROGRESS SUMMARY</p>
                    <h2 id="execution-summary-title">进度摘要</h2>
                  </div>
                  <span className="quiet-badge">
                    {state.execution.run.taskStatus}
                  </span>
                </div>
                <dl className="execution-summary-grid">
                  <div>
                    <dt>当前任务</dt>
                    <dd>{state.execution.run.taskId}</dd>
                  </div>
                  <div>
                    <dt>目标与角色</dt>
                    <dd>
                      {state.execution.run.goalId} · {state.execution.run.role}
                    </dd>
                  </div>
                  <div>
                    <dt>开始时间</dt>
                    <dd>{dateText(state.execution.run.startedAt)}</dd>
                  </div>
                  <div>
                    <dt>结束时间</dt>
                    <dd>{dateText(state.execution.run.completedAt)}</dd>
                  </div>
                  <div>
                    <dt>事件数量</dt>
                    <dd>{state.execution.run.events.length}</dd>
                  </div>
                  <div>
                    <dt>最新执行结果</dt>
                    <dd>
                      {resultSummary(state.execution.run) ?? "尚无结果摘要"}
                    </dd>
                  </div>
                </dl>
              </section>

              {recovery !== null && (
                <section
                  className="overview-panel execution-recovery-panel"
                  aria-labelledby="execution-recovery-title"
                >
                  <p className="eyebrow">RECOVERY DECISION</p>
                  <h2 id="execution-recovery-title">需要恢复决策</h2>
                  <p>{recovery.reason}</p>
                  <p className="execution-impact">
                    选择会立即影响当前执行：恢复将继续原执行链；重新执行将重新启动该任务；取消将结束执行并保留审计记录。
                  </p>
                  <div className="execution-choice-list">
                    <button
                      className="button primary"
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => chooseRecovery("resume")}
                    >
                      {busyAction === "resume" ? "提交中…" : "恢复执行"}
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => chooseRecovery("retry")}
                    >
                      {busyAction === "retry" ? "提交中…" : "重新执行"}
                    </button>
                    <button
                      className="button danger"
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => chooseRecovery("cancel")}
                    >
                      {busyAction === "cancel" ? "提交中…" : "取消执行"}
                    </button>
                  </div>
                </section>
              )}

              <section
                className="overview-panel"
                aria-labelledby="execution-timeline-title"
              >
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">AUDIT-BACKED TIMELINE</p>
                    <h2 id="execution-timeline-title">实时进度与报告</h2>
                  </div>
                  <span className="quiet-badge">{state.reports.length} 条</span>
                </div>
                {state.reports.length === 0 ? (
                  <p className="muted-note">
                    尚无可验证报告；不能将当前执行显示为已完成。
                  </p>
                ) : (
                  <ol className="execution-timeline">
                    {state.reports
                      .slice()
                      .sort((left, right) =>
                        right.occurredAt.localeCompare(left.occurredAt),
                      )
                      .map((report) => (
                        <li className="execution-timeline-item" key={report.id}>
                          <div>
                            <span className="stage-status">{report.kind}</span>
                            <strong>{report.title}</strong>
                          </div>
                          <p>{report.summary}</p>
                          <small>
                            {report.id} · {dateText(report.occurredAt)}
                          </small>
                        </li>
                      ))}
                  </ol>
                )}
              </section>
              {notice !== null && (
                <div className="overview-alert" role="status">
                  {notice}
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
