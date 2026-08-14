import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import {
  requestProjectList,
  requestProjectStartup,
  selectCurrentProject,
  type OverviewApiError,
  type ProjectListPayload,
  type ProjectOverviewItem,
  type ProjectStartupPayload,
  type StartupSummary,
} from "./project-overview";

type ProjectOverviewProps = Readonly<{
  readonly onCreate: () => void;
}>;

type LoadState =
  | Readonly<{ readonly status: "loading" }>
  | Readonly<{ readonly status: "ready"; readonly value: ProjectListPayload }>
  | Readonly<{ readonly status: "error"; readonly error: OverviewApiError }>;

type StartupState =
  | Readonly<{ readonly status: "idle" }>
  | Readonly<{ readonly status: "loading" }>
  | Readonly<{
      readonly status: "ready";
      readonly value: ProjectStartupPayload;
    }>
  | Readonly<{ readonly status: "error"; readonly error: OverviewApiError }>;

const summarySections: readonly Readonly<{
  readonly key: keyof StartupSummary;
  readonly label: string;
}>[] = [
  { key: "goal", label: "项目目标" },
  { key: "approvedShortTermGoal", label: "当前获批短期目标" },
  { key: "completedResults", label: "已完成成果" },
  { key: "currentTask", label: "当前任务" },
  { key: "blockersRisksDecisions", label: "Blocker、风险和待决策事项" },
  { key: "lastStep", label: "上一步" },
  { key: "recommendedNext", label: "推荐下一步" },
  { key: "userActionNeeded", label: "用户待办" },
];

function errorText(error: OverviewApiError): string {
  return error.details.length === 0
    ? error.message
    : `${error.message}（${error.details.join("；")}）`;
}

function valueOrMissing(value: string): string {
  return value.trim().length === 0 ? "未提供" : value;
}

function projectStateText(project: ProjectOverviewItem): string {
  return project.state === "available" ? "事实可读" : "需要恢复";
}

function ProjectCard({
  project,
  busy,
  onSelect,
}: Readonly<{
  readonly project: ProjectOverviewItem;
  readonly busy: boolean;
  readonly onSelect: (projectKey: string) => void;
}>): ReactElement {
  return (
    <li className={`project-card ${project.selected ? "selected" : ""}`}>
      <button
        className="project-card-button"
        type="button"
        aria-pressed={project.selected}
        disabled={busy}
        onClick={() => onSelect(project.projectKey)}
      >
        <span className="project-card-heading">
          <span>
            <strong>{project.name}</strong>
            {project.selected && <span className="current-badge">当前</span>}
          </span>
          <span className={`project-state ${project.state}`}>
            {projectStateText(project)}
          </span>
        </span>
        <span className="project-card-path">{project.rootPath}</span>
        <span className="project-card-meta">
          <span>状态：{project.status || "未提供"}</span>
          <span>
            {project.statusRevision === null
              ? "快照 revision：未提供"
              : `快照 revision：${project.statusRevision}`}
          </span>
        </span>
        {project.factsError !== undefined && (
          <span className="project-card-error">
            {project.factsError.message}
          </span>
        )}
      </button>
    </li>
  );
}

function StartupSummaryView({
  startup,
}: Readonly<{ readonly startup: ProjectStartupPayload }>): ReactElement {
  if (startup.needsRecovery) {
    return (
      <div className="overview-alert recovery" role="alert">
        <strong>项目事实需要恢复</strong>
        <p>系统没有自动重建或写入。请先检查项目目录中的治理文件。</p>
      </div>
    );
  }

  if (startup.summary === null) {
    return (
      <div className="overview-alert" role="status">
        当前启动没有返回摘要内容。
      </div>
    );
  }

  return (
    <div className="startup-summary" aria-labelledby="startup-summary-title">
      <div className="summary-heading">
        <div>
          <p className="eyebrow">DAILY STARTUP</p>
          <h2 id="startup-summary-title">今日启动摘要</h2>
        </div>
        <span className="source-note">来源：项目事实与 status.md</span>
      </div>
      <div className="summary-status-row">
        <span>
          当前状态：<strong>{startup.currentStatus?.status ?? "未提供"}</strong>
        </span>
        {startup.needsUserAction && (
          <span className="action-badge">需要用户处理</span>
        )}
        {!startup.needsUserAction && (
          <span className="quiet-badge">暂无用户待办</span>
        )}
      </div>
      <dl className="summary-grid">
        {summarySections.map(({ key, label }) => (
          <div
            className={`summary-item ${key === "recommendedNext" ? "recommended" : ""}`}
            key={key}
          >
            <dt>{label}</dt>
            <dd>{valueOrMissing(startup.summary?.[key] ?? "")}</dd>
            <span className="field-source">事实来源</span>
          </div>
        ))}
      </dl>
      <p className="read-only-note">
        推荐下一步仅供参考，不会自动批准、执行或改变项目状态。
      </p>
    </div>
  );
}

export function ProjectOverview({
  onCreate,
}: ProjectOverviewProps): ReactElement {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [startup, setStartup] = useState<StartupState>({ status: "idle" });
  const [selectionBusy, setSelectionBusy] = useState(false);

  const loadProjects = (): void => {
    setLoad({ status: "loading" });
    void requestProjectList().then((result) => {
      setLoad(
        result.ok
          ? { status: "ready", value: result.value }
          : { status: "error", error: result.error },
      );
    });
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleSelect = (projectKey: string): void => {
    setSelectionBusy(true);
    setStartup({ status: "idle" });
    void selectCurrentProject(projectKey).then((result) => {
      setSelectionBusy(false);
      setLoad(
        result.ok
          ? { status: "ready", value: result.value }
          : { status: "error", error: result.error },
      );
    });
  };

  const handleStartup = (projectKey: string): void => {
    setStartup({ status: "loading" });
    void requestProjectStartup(projectKey).then((result) => {
      setStartup(
        result.ok
          ? { status: "ready", value: result.value }
          : { status: "error", error: result.error },
      );
    });
  };

  return (
    <section className="overview-shell" aria-labelledby="overview-title">
      <div className="overview-intro">
        <p className="eyebrow">PROJECT OVERVIEW</p>
        <h1 id="overview-title">项目总览</h1>
        <p className="tagline">从项目事实开始今天的工作。</p>
        <p className="description">
          选择一个已登记项目，查看当前状态，并由你主动触发今日启动摘要。
        </p>
      </div>

      <div className="overview-panel project-list-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">REGISTERED PROJECTS</p>
            <h2>已登记项目</h2>
          </div>
          <button
            className="button secondary"
            type="button"
            onClick={loadProjects}
            disabled={load.status === "loading"}
          >
            刷新列表
          </button>
        </div>

        {load.status === "loading" && (
          <div className="overview-loading" role="status">
            正在读取中央 registry…
          </div>
        )}
        {load.status === "error" && (
          <div className="overview-alert error" role="alert">
            <strong>无法读取项目列表</strong>
            <p>{errorText(load.error)}</p>
            <button
              className="button secondary"
              type="button"
              onClick={loadProjects}
            >
              重试
            </button>
          </div>
        )}
        {load.status === "ready" && load.value.projects.length === 0 && (
          <div className="empty-projects">
            <h3>尚未登记项目</h3>
            <p>先创建一个受治理的项目，之后它会出现在这里。</p>
            <button className="button primary" type="button" onClick={onCreate}>
              创建项目
            </button>
          </div>
        )}
        {load.status === "ready" && load.value.projects.length > 0 && (
          <>
            {load.value.selectionState === "needs_recovery" && (
              <div className="overview-alert recovery" role="alert">
                当前选择指向不可用的项目。请重新选择一个已登记项目。
              </div>
            )}
            <ul className="project-list">
              {load.value.projects.map((project) => (
                <ProjectCard
                  busy={selectionBusy}
                  key={project.projectKey}
                  onSelect={handleSelect}
                  project={project}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      {load.status === "ready" && load.value.currentProjectKey !== null && (
        <div className="overview-panel startup-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">USER-TRIGGERED</p>
              <h2>每日启动</h2>
            </div>
            <span className="read-only-badge">需要主动触发</span>
          </div>
          <p className="description">
            启动只读取当前项目事实并生成摘要，不会自动选择任务或开始执行。
          </p>
          <button
            className="button primary startup-button"
            type="button"
            onClick={() => handleStartup(load.value.currentProjectKey ?? "")}
            disabled={startup.status === "loading"}
          >
            {startup.status === "loading" ? "正在读取摘要…" : "启动今日工作"}
          </button>

          {startup.status === "error" && (
            <div className="overview-alert error" role="alert">
              <strong>启动摘要读取失败</strong>
              <p>{errorText(startup.error)}</p>
            </div>
          )}
          {startup.status === "ready" && (
            <StartupSummaryView startup={startup.value} />
          )}
        </div>
      )}
    </section>
  );
}
