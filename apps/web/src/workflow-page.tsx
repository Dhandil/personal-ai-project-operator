import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { requestProjectList, type OverviewApiError } from "./project-overview";
import {
  requestSkipDecision,
  requestSkipProposal,
  requestWorkflow,
  type SkipProposal,
  type WorkflowApiError,
  workflowGuides,
  type WorkflowPayload,
} from "./workflow";
import {
  PlanningConsole,
  type PlanningConsoleView,
} from "./planning-console-page";

type WorkflowPageState =
  | Readonly<{ readonly status: "loading" }>
  | Readonly<{ readonly status: "ready"; readonly value: WorkflowPayload }>
  | Readonly<{
      readonly status: "error";
      readonly error: OverviewApiError | WorkflowApiError;
    }>;

type FormState = Readonly<{
  readonly material: string;
  readonly missing: string;
  readonly risks: string;
}>;

const emptyForm: FormState = { material: "", missing: "", risks: "" };

function splitLines(value: string): readonly string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function errorText(error: OverviewApiError | WorkflowApiError): string {
  return error.details.length === 0
    ? error.message
    : `${error.message}（${error.details.join("；")}）`;
}

function stageStatusText(
  status: WorkflowPayload["stages"][number]["status"],
): string {
  return {
    draft: "待开始",
    in_progress: "进行中",
    completed: "已完成",
    skipped: "已跳过",
  }[status];
}

function WorkflowStageList({
  workflow,
}: Readonly<{ readonly workflow: WorkflowPayload }>): ReactElement {
  return (
    <ol className="workflow-stage-list">
      {workflow.stages.map((stage) => (
        <li
          className={`workflow-stage ${stage.status} ${stage.key === workflow.currentStage ? "current" : ""}`}
          key={stage.key}
        >
          <div className="workflow-stage-marker" aria-hidden="true">
            {stage.order}
          </div>
          <div className="workflow-stage-content">
            <div className="workflow-stage-heading">
              <h3>{stage.title}</h3>
              <span className={`stage-status ${stage.status}`}>
                {stageStatusText(stage.status)}
              </span>
            </div>
            {stage.key === workflow.currentStage && (
              <span className="current-stage-note">当前阶段</span>
            )}
            {stage.skipReason !== undefined && (
              <p className="skip-reason">跳过理由：{stage.skipReason}</p>
            )}
            <div className="stage-fact-status">
              <span className="stage-fact-label">阶段状态</span>
              <span className={`stage-status ${stage.status}`}>
                {stageStatusText(stage.status)}
              </span>
            </div>
            <div className="stage-artifacts" aria-label="文件状态">
              <span className="stage-fact-label">文件状态</span>
              {stage.artifacts.length === 0 ? (
                <span className="artifact-note">
                  无独立阶段文件；使用共用正式材料，无需上传。
                </span>
              ) : (
                stage.artifacts.map((artifact) => (
                  <span
                    className={`artifact-link ${artifact.state}`}
                    key={artifact.relativePath}
                  >
                    <code>{artifact.relativePath}</code>
                    <span>
                      {artifact.state === "available"
                        ? "已存在 · 系统已创建"
                        : "尚未存在 · 无需上传"}
                    </span>
                  </span>
                ))
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ExplanationList({
  label,
  values,
}: Readonly<{
  readonly label: string;
  readonly values: readonly string[];
}>): ReactElement {
  return (
    <div className="explanation-block">
      <strong>{label}</strong>
      {values.length === 0 ? (
        <p className="missing-fact">未提供</p>
      ) : (
        <ul>
          {values.map((value) => (
            <li key={value}>{value}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function WorkflowPage(): ReactElement {
  const [state, setState] = useState<WorkflowPageState>({ status: "loading" });
  const [proposal, setProposal] = useState<SkipProposal | null>(null);
  const [proposalFormOpen, setProposalFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [decisionReason, setDecisionReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [consoleView, setConsoleView] = useState<PlanningConsoleView>("stages");

  const load = (): void => {
    setState({ status: "loading" });
    void requestProjectList().then((projects) => {
      if (!projects.ok) {
        setState({ status: "error", error: projects.error });
        return;
      }
      if (projects.value.currentProjectKey === null) {
        setState({
          status: "error",
          error: {
            code: "selection_required",
            message: "请先在项目总览中选择当前项目。",
            details: [],
          },
        });
        return;
      }
      void requestWorkflow(projects.value.currentProjectKey).then(
        (workflow) => {
          setState(
            workflow.ok
              ? { status: "ready", value: workflow.value }
              : { status: "error", error: workflow.error },
          );
        },
      );
    });
  };

  useEffect(() => {
    load();
  }, []);

  const currentStage =
    state.status === "ready"
      ? state.value.stages.find(
          (stage) => stage.key === state.value.currentStage,
        )
      : undefined;

  const createProposal = (): void => {
    if (state.status !== "ready" || currentStage === undefined) return;
    setBusy(true);
    setNotice(null);
    void requestSkipProposal({
      projectKey: state.value.projectKey,
      stageKey: currentStage.key,
      material: splitLines(form.material),
      missing: splitLines(form.missing),
      risks: splitLines(form.risks),
    }).then((result) => {
      setBusy(false);
      if (result.ok) {
        setProposal(result.value);
        setProposalFormOpen(false);
      } else {
        setNotice(errorText(result.error));
      }
    });
  };

  const decide = (approved: boolean): void => {
    if (state.status !== "ready" || proposal === null) return;
    if (decisionReason.trim().length === 0) {
      setNotice("请填写用户决定理由。");
      return;
    }
    setBusy(true);
    setNotice(null);
    void requestSkipDecision({
      projectKey: state.value.projectKey,
      proposal: proposal.proposal,
      approved,
      reason: decisionReason,
    }).then((result) => {
      setBusy(false);
      if (result.ok) {
        setState({ status: "ready", value: result.value.workflow });
        setProposal(null);
        setDecisionReason("");
        setNotice(
          result.value.changed
            ? "已记录用户批准的跳过决定。"
            : "已记录用户拒绝的跳过建议。",
        );
      } else {
        setNotice(errorText(result.error));
      }
    });
  };

  return (
    <section className="workflow-page" aria-labelledby="workflow-page-title">
      <a className="back-link" href="/">
        ← 返回项目总览
      </a>
      <div className="workflow-page-intro">
        <p className="eyebrow">WORKFLOW</p>
        <h1 id="workflow-page-title">工作流阶段</h1>
        <p className="description">
          查看默认阶段、正式阶段材料和当前阶段。阶段状态与文件状态是两件事；跳过只能由用户决定并留下理由。
        </p>
      </div>

      <div className="workflow-path" aria-label="工作流路径">
        <span>工作流路径</span>
        <a href="/">项目总览</a>
        <span aria-hidden="true">→</span>
        <strong>工作流</strong>
        <span aria-hidden="true">→</span>
        <a href="/projects/execution">执行控制台</a>
      </div>

      <details className="workflow-help">
        <summary>第一次使用？查看工作流的 3 步说明</summary>
        <div className="workflow-help-content">
          <ol className="workflow-onboarding-steps">
            <li>
              <strong>系统初始化</strong>
              <span>创建项目治理文件和默认流程。</span>
            </li>
            <li>
              <strong>Agent 处理</strong>
              <span>读取正式材料，在获准边界内更新事实并交接。</span>
            </li>
            <li>
              <strong>用户决策</strong>
              <span>审批目标、范围和跳过建议；系统不会自动替你决定。</span>
            </li>
          </ol>
          <p className="workflow-onboarding-note">
            阶段文件由系统按流程读取和创建，不是上传清单，用户无需手工上传。
          </p>
        </div>
      </details>

      {state.status === "ready" && (
        <>
          <nav className="workflow-console-tabs" aria-label="规划控制台视图">
            <button
              className={consoleView === "stages" ? "active" : ""}
              type="button"
              aria-pressed={consoleView === "stages"}
              onClick={() => setConsoleView("stages")}
            >
              当前阶段与操作
            </button>
            <button
              className={consoleView === "draft" ? "active" : ""}
              type="button"
              aria-pressed={consoleView === "draft"}
              onClick={() => setConsoleView("draft")}
            >
              规划草案
            </button>
          </nav>
          <PlanningConsole
            projectKey={state.value.projectKey}
            view={consoleView}
          />
        </>
      )}

      {state.status === "loading" && (
        <div className="overview-loading" role="status">
          正在读取工作流…
        </div>
      )}
      {state.status === "error" && (
        <div className="overview-alert error" role="alert">
          <strong>无法读取工作流</strong>
          <p>{errorText(state.error)}</p>
          <a className="button secondary" href="/">
            返回项目总览
          </a>
        </div>
      )}
      {state.status === "ready" && (
        <>
          {currentStage !== undefined && (
            <section
              className="overview-panel current-stage-guide"
              aria-labelledby="current-stage-guide-title"
            >
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">RECOMMENDED NEXT STEP</p>
                  <h2 id="current-stage-guide-title">
                    当前阶段：{currentStage.title}
                  </h2>
                </div>
                <span className={`stage-status ${currentStage.status}`}>
                  {stageStatusText(currentStage.status)}
                </span>
              </div>
              <div className="current-stage-guide-grid">
                <div>
                  <strong>首要操作</strong>
                  <p>{workflowGuides[currentStage.key].primaryAction}</p>
                </div>
                <div>
                  <strong>需要读取的产物</strong>
                  <ul>
                    {workflowGuides[currentStage.key].readArtifacts.map(
                      (path) => (
                        <li key={path}>
                          <code>{path}</code>
                        </li>
                      ),
                    )}
                  </ul>
                </div>
                <div>
                  <strong>推荐下一步</strong>
                  <p>{workflowGuides[currentStage.key].nextStep}</p>
                  {workflowGuides[currentStage.key].nextHref !== undefined && (
                    <a
                      className="button secondary"
                      href={workflowGuides[currentStage.key].nextHref}
                    >
                      打开相关入口 →
                    </a>
                  )}
                </div>
              </div>
            </section>
          )}

          <div className="overview-panel workflow-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">DEFAULT WORKFLOW</p>
                <h2>阶段顺序</h2>
              </div>
              <span className="source-note">
                来源：workflow.md · revision {state.value.revision}
              </span>
            </div>
            <WorkflowStageList workflow={state.value} />
          </div>

          {currentStage !== undefined &&
            currentStage.status === "draft" &&
            proposal === null && (
              <div className="overview-panel skip-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">USER DECISION GATE</p>
                    <h2>跳过建议</h2>
                  </div>
                  <span className="read-only-badge">Agent 只能建议</span>
                </div>
                <p className="description">
                  当前阶段：{currentStage.title}
                  。请先补充材料、缺失信息和风险，生成一份可供用户审阅的建议。
                </p>
                {!proposalFormOpen ? (
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => setProposalFormOpen(true)}
                  >
                    生成跳过建议
                  </button>
                ) : (
                  <div
                    className="skip-form"
                    role="dialog"
                    aria-labelledby="skip-form-title"
                  >
                    <h3 id="skip-form-title">Agent 跳过建议依据</h3>
                    <p className="muted-note">
                      每行填写一条；空白项会明确显示为未提供。
                    </p>
                    {(["material", "missing", "risks"] as const).map((key) => (
                      <label key={key}>
                        {key === "material"
                          ? "已有材料"
                          : key === "missing"
                            ? "缺失信息"
                            : "潜在风险"}
                        <textarea
                          value={form[key]}
                          onChange={(event) =>
                            setForm({ ...form, [key]: event.target.value })
                          }
                          placeholder="每行一条"
                        />
                      </label>
                    ))}
                    <div className="wizard-actions">
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => setProposalFormOpen(false)}
                      >
                        取消
                      </button>
                      <button
                        className="button primary"
                        type="button"
                        onClick={createProposal}
                        disabled={busy}
                      >
                        {busy ? "正在生成…" : "生成建议"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

          {proposal !== null && (
            <div className="overview-panel proposal-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">AGENT PROPOSAL</p>
                  <h2>请用户决定是否跳过</h2>
                </div>
                <span className="read-only-badge">尚未改变事实</span>
              </div>
              <p className="proposal-rationale">
                {proposal.proposal.rationale}
              </p>
              <div className="explanation-grid">
                <ExplanationList
                  label="已有材料"
                  values={proposal.explanation.material}
                />
                <ExplanationList
                  label="缺失信息"
                  values={proposal.explanation.missing}
                />
                <ExplanationList
                  label="潜在风险"
                  values={proposal.explanation.risks}
                />
              </div>
              <label className="decision-reason">
                用户决定理由
                <textarea
                  value={decisionReason}
                  onChange={(event) => setDecisionReason(event.target.value)}
                  placeholder="说明批准或拒绝的理由"
                />
              </label>
              <div className="wizard-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => decide(false)}
                  disabled={busy}
                >
                  拒绝并继续当前阶段
                </button>
                <button
                  className="button primary"
                  type="button"
                  onClick={() => decide(true)}
                  disabled={busy}
                >
                  批准跳过并记录理由
                </button>
              </div>
            </div>
          )}
          {notice !== null && (
            <div className="overview-alert" role="status">
              {notice}
            </div>
          )}
        </>
      )}
    </section>
  );
}
