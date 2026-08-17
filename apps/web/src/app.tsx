import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { ProjectCreationWizard } from "./project-creation-wizard";
import { ProjectOverview } from "./project-overview-page";
import { strings } from "./strings";
import { WorkflowPage } from "./workflow-page";
import { GoalPage } from "./goal-page";
import { RolePage } from "./role-page";
import { IssuePage } from "./issue-page";
import { ReportPage } from "./report-page";
import { TaskPage } from "./task-page";
import { ApprovalPage } from "./approval-page";
import { HistoryPageView } from "./history-page";
import { ExecutionConsolePage } from "./execution-console-page";
import {
  requestProjectList,
  type ProjectOverviewItem,
} from "./project-overview";

export type AppRoute =
  | "home"
  | "health"
  | "create"
  | "overview"
  | "workflow"
  | "goals"
  | "roles"
  | "issues"
  | "reports"
  | "tasks"
  | "approvals"
  | "history"
  | "execution";

export type NavigationModule =
  "workspace" | "projects" | "execution" | "governance" | "system";

export type NavigationItem = Readonly<{
  readonly label: string;
  readonly href: string;
  readonly route: AppRoute;
}>;

export type PrimaryNavigationItem = Readonly<
  NavigationItem & { readonly module: NavigationModule }
>;

export const primaryNavigation: readonly PrimaryNavigationItem[] = [
  { module: "workspace", label: "工作台", href: "/", route: "home" },
  { module: "projects", label: "项目", href: "/projects", route: "overview" },
  {
    module: "execution",
    label: "执行",
    href: "/projects/execution",
    route: "execution",
  },
  {
    module: "governance",
    label: "治理",
    href: "/projects/approvals",
    route: "approvals",
  },
  { module: "system", label: "系统", href: "/health", route: "health" },
] as const;

export const secondaryNavigation: Readonly<
  Record<NavigationModule, readonly NavigationItem[]>
> = {
  workspace: [
    { label: "项目列表", href: "/", route: "home" },
    { label: "新建项目", href: "/projects/new", route: "create" },
  ],
  projects: [
    { label: "概览", href: "/projects", route: "overview" },
    { label: "工作流", href: "/projects/workflow", route: "workflow" },
    { label: "目标", href: "/projects/goals", route: "goals" },
    { label: "任务", href: "/projects/tasks", route: "tasks" },
    { label: "角色", href: "/projects/roles", route: "roles" },
  ],
  execution: [
    { label: "执行控制台", href: "/projects/execution", route: "execution" },
    { label: "运行报告", href: "/projects/reports", route: "reports" },
  ],
  governance: [
    { label: "审批", href: "/projects/approvals", route: "approvals" },
    { label: "问题与决策", href: "/projects/issues", route: "issues" },
    { label: "历史", href: "/projects/history", route: "history" },
  ],
  system: [{ label: "服务状态", href: "/health", route: "health" }],
} as const;

type HealthPayload = Readonly<{
  readonly status: "ok";
  readonly service: string;
}>;

type HealthState =
  | Readonly<{ readonly status: "checking" }>
  | Readonly<{ readonly status: "connected"; readonly service: string }>
  | Readonly<{ readonly status: "unavailable" }>;

type ClaudeRuntimePayload = Readonly<{
  readonly runtime: "claude";
  readonly executable: string;
  readonly configuredModel: string | null;
  readonly authenticationStatus: string;
  readonly canExecute: boolean;
  readonly timeoutMs: number;
  readonly commands: Readonly<Record<string, boolean>>;
  readonly blockers: readonly string[];
  readonly recommendations: readonly string[];
}>;

type ClaudeRuntimeState =
  | Readonly<{ readonly status: "checking" }>
  | Readonly<{
      readonly status: "ready";
      readonly value: ClaudeRuntimePayload;
    }>
  | Readonly<{ readonly status: "unavailable"; readonly message: string }>;

export function resolveRoute(pathname: string): AppRoute {
  if (pathname === "/projects/new") {
    return "create";
  }
  if (pathname === "/projects") {
    return "overview";
  }
  if (pathname === "/projects/workflow") {
    return "workflow";
  }
  if (pathname === "/projects/goals") {
    return "goals";
  }
  if (pathname === "/projects/roles") {
    return "roles";
  }
  if (pathname === "/projects/issues") {
    return "issues";
  }
  if (pathname === "/projects/reports") {
    return "reports";
  }
  if (pathname === "/projects/tasks") {
    return "tasks";
  }
  if (pathname === "/projects/approvals") return "approvals";
  if (pathname === "/projects/history") return "history";
  if (pathname === "/projects/execution") return "execution";
  return pathname === "/health" ? "health" : "home";
}

export function navigationModuleForRoute(route: AppRoute): NavigationModule {
  if (route === "create" || route === "home") return "workspace";
  if (
    route === "overview" ||
    route === "workflow" ||
    route === "goals" ||
    route === "tasks" ||
    route === "roles"
  ) {
    return "projects";
  }
  if (route === "execution" || route === "reports") return "execution";
  if (route === "approvals" || route === "issues" || route === "history") {
    return "governance";
  }
  return "system";
}

type ProjectContextState =
  | Readonly<{ readonly status: "loading" }>
  | Readonly<{
      readonly status: "ready";
      readonly project: ProjectOverviewItem | null;
    }>
  | Readonly<{ readonly status: "unavailable" }>;

function CurrentProjectContext({
  state,
}: Readonly<{ readonly state: ProjectContextState }>): ReactElement {
  const name =
    state.status === "ready"
      ? (state.project?.name ?? "未选择项目")
      : state.status === "loading"
        ? "正在读取…"
        : "项目上下文不可用";
  const rootPath =
    state.status === "ready" ? (state.project?.rootPath ?? "") : "";

  return (
    <div
      className="current-project-context"
      aria-label="当前项目上下文"
      role="region"
    >
      <span className="current-project-label">当前项目</span>
      <strong>{name}</strong>
      {rootPath !== "" && <small title={rootPath}>{rootPath}</small>}
    </div>
  );
}

function WorkspaceHome({
  health,
  projectContext,
}: Readonly<{
  readonly health: HealthState;
  readonly projectContext: ProjectContextState;
}>): ReactElement {
  const hasProject =
    projectContext.status === "ready" && projectContext.project !== null;
  const projectName = hasProject
    ? (projectContext.project?.name ?? "当前项目")
    : "还没有当前项目";

  return (
    <section className="workspace-home" aria-labelledby="workspace-home-title">
      <div className="workspace-home-hero">
        <div>
          <p className="eyebrow">PERSONAL OPERATIONS DESK</p>
          <h1 id="workspace-home-title">今天从哪里继续？</h1>
          <p className="workspace-home-lede">
            工作台负责跨项目导航；进入项目后，再启动今日工作、处理阶段和交接。
          </p>
        </div>
        <div className="workspace-home-current" aria-label="当前工作入口">
          <span className="stage-fact-label">当前项目</span>
          <strong>{projectName}</strong>
          {hasProject && (
            <small className="workspace-home-current-note">
              进入项目后点击“启动今日工作”
            </small>
          )}
          <a
            className="button primary"
            href={hasProject ? "/projects" : "/projects/new"}
          >
            {hasProject ? "进入当前项目" : "新建第一个项目"} →
          </a>
        </div>
      </div>

      <div className="workspace-home-grid">
        <section
          className="workspace-home-panel workspace-home-flow"
          aria-labelledby="workspace-flow-title"
        >
          <div className="panel-heading">
            <div>
              <p className="eyebrow">DAILY LOOP</p>
              <h2 id="workspace-flow-title">每日工作顺序</h2>
            </div>
            <span className="read-only-badge">用户只在关键门决策</span>
          </div>
          <ol className="workspace-flow-list">
            <li>
              <span>01</span>
              <div>
                <strong>进入项目</strong>
                <small>确认当前目标与待办</small>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>启动今日工作</strong>
                <small>恢复事实并确定今天的执行边界</small>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>处理交接与审批</strong>
                <small>Agent 自动推进，遇到决策门再由你确认</small>
              </div>
            </li>
          </ol>
        </section>

        <section
          className="workspace-home-panel workspace-home-links"
          aria-labelledby="workspace-links-title"
        >
          <div className="panel-heading">
            <div>
              <p className="eyebrow">QUICK ACCESS</p>
              <h2 id="workspace-links-title">常用入口</h2>
            </div>
          </div>
          <div className="workspace-quick-links">
            <a href={hasProject ? "/projects/workflow" : "/projects/new"}>
              <strong>{hasProject ? "继续前期规划" : "创建项目"}</strong>
              <span>
                {hasProject
                  ? "Idea → Discovery → Spec"
                  : "建立治理文件和默认流程"}{" "}
                →
              </span>
            </a>
            <a href="/projects/execution">
              <strong>执行控制台</strong>
              <span>查看运行、交接和恢复 →</span>
            </a>
            <a href="/projects/approvals">
              <strong>治理中心</strong>
              <span>审批、问题与历史 →</span>
            </a>
          </div>
        </section>
      </div>

      <section
        aria-label="后端连接状态"
        className="workspace-home-status"
        role="region"
      >
        <div>
          <p className="eyebrow">SYSTEM</p>
          <h2 id="workspace-status-title">服务状态</h2>
        </div>
        <div className={`health-state ${health.status}`} role="status">
          <span className="status-dot" aria-hidden="true" />
          <span>
            {health.status === "checking" && strings.health.checking}
            {health.status === "connected" &&
              `${strings.health.connected} · ${health.service}`}
            {health.status === "unavailable" && strings.health.unavailable}
          </span>
        </div>
        <a className="text-link" href="/health">
          查看详情 →
        </a>
      </section>
    </section>
  );
}

function HealthPage({
  health,
  runtime,
}: Readonly<{
  readonly health: HealthState;
  readonly runtime: ClaudeRuntimeState;
}>): ReactElement {
  const statusLabel =
    health.status === "checking"
      ? "检查中"
      : health.status === "connected"
        ? "已连接"
        : "不可用";
  return (
    <section className="health-page" aria-labelledby="health-page-title">
      <div className="health-page-intro">
        <p className="eyebrow">SYSTEM · DIAGNOSTICS</p>
        <h1 id="health-page-title">系统状态</h1>
        <p className="description">
          这里只显示本地服务和运行环境状态，不承载项目工作流。
        </p>
      </div>
      <div className="health-page-grid">
        <section
          className="health-card"
          aria-labelledby="health-connection-title"
        >
          <div className="health-card-heading">
            <div>
              <span className="stage-fact-label">LOCAL SERVICE</span>
              <h2 id="health-connection-title">后端连接</h2>
            </div>
            <span className={`health-pill ${health.status}`}>
              {statusLabel}
            </span>
          </div>
          <div className={`health-state ${health.status}`} role="status">
            <span className="status-dot" aria-hidden="true" />
            <span>
              {health.status === "checking" && strings.health.checking}
              {health.status === "connected" &&
                `${strings.health.connected} · ${health.service}`}
              {health.status === "unavailable" && strings.health.unavailable}
            </span>
          </div>
        </section>
        <section
          className="health-card"
          aria-labelledby="health-endpoint-title"
        >
          <span className="stage-fact-label">ENDPOINT</span>
          <h2 id="health-endpoint-title">检查地址</h2>
          <code className="health-endpoint">/health</code>
          <p>服务状态由本地后端实时返回，不会修改项目文件。</p>
        </section>
        <section
          className="health-card runtime-diagnostic-card"
          aria-labelledby="claude-runtime-title"
        >
          <div className="health-card-heading">
            <div>
              <span className="stage-fact-label">CLAUDE RUNTIME</span>
              <h2 id="claude-runtime-title">Claude Code 运行能力</h2>
            </div>
            <span
              className={`health-pill ${runtime.status === "ready" && runtime.value.canExecute ? "connected" : runtime.status === "unavailable" ? "unavailable" : "checking"}`}
            >
              {runtime.status === "checking"
                ? "检查中"
                : runtime.status === "unavailable"
                  ? "不可用"
                  : runtime.value.canExecute
                    ? "可执行"
                    : "受阻"}
            </span>
          </div>
          {runtime.status === "checking" && (
            <p>正在检查 Claude Code 安装、认证和能力…</p>
          )}
          {runtime.status === "unavailable" && (
            <p role="alert">无法读取 Claude Runtime 诊断：{runtime.message}</p>
          )}
          {runtime.status === "ready" && (
            <div className="runtime-diagnostic-content">
              <dl className="runtime-diagnostic-grid">
                <div>
                  <dt>认证状态</dt>
                  <dd>{runtime.value.authenticationStatus}</dd>
                </div>
                <div>
                  <dt>配置模型</dt>
                  <dd>{runtime.value.configuredModel ?? "未配置"}</dd>
                </div>
                <div>
                  <dt>执行超时</dt>
                  <dd>{Math.round(runtime.value.timeoutMs / 1000)} 秒</dd>
                </div>
                <div>
                  <dt>可执行能力</dt>
                  <dd>{runtime.value.canExecute ? "已满足" : "未满足"}</dd>
                </div>
              </dl>
              {(runtime.value.blockers.length > 0 ||
                runtime.value.recommendations.length > 0) && (
                <div className="runtime-diagnostic-notices">
                  {runtime.value.blockers.map((item) => (
                    <p
                      className="runtime-diagnostic-blocker"
                      key={`blocker-${item}`}
                    >
                      阻断：{item}
                    </p>
                  ))}
                  {runtime.value.recommendations.map((item) => (
                    <p
                      className="runtime-diagnostic-recommendation"
                      key={`recommendation-${item}`}
                    >
                      建议：{item}
                    </p>
                  ))}
                </div>
              )}
              <p className="runtime-diagnostic-note">
                诊断只显示能力摘要，不显示凭据、令牌或认证原文。
              </p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function isHealthPayload(value: unknown): value is HealthPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return payload.status === "ok" && typeof payload.service === "string";
}

function isClaudeRuntimePayload(value: unknown): value is ClaudeRuntimePayload {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Record<string, unknown>;
  return (
    payload.runtime === "claude" &&
    typeof payload.executable === "string" &&
    (payload.configuredModel === null ||
      typeof payload.configuredModel === "string") &&
    typeof payload.authenticationStatus === "string" &&
    typeof payload.canExecute === "boolean" &&
    typeof payload.timeoutMs === "number" &&
    typeof payload.commands === "object" &&
    payload.commands !== null &&
    Object.values(payload.commands).every(
      (item) => typeof item === "boolean",
    ) &&
    Array.isArray(payload.blockers) &&
    payload.blockers.every((item) => typeof item === "string") &&
    Array.isArray(payload.recommendations) &&
    payload.recommendations.every((item) => typeof item === "string")
  );
}

export function App(): ReactElement {
  const [health, setHealth] = useState<HealthState>({ status: "checking" });
  const [claudeRuntime, setClaudeRuntime] = useState<ClaudeRuntimeState>({
    status: "checking",
  });
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [projectContext, setProjectContext] = useState<ProjectContextState>({
    status: "loading",
  });
  const route = resolveRoute(window.location.pathname);
  const currentModule = navigationModuleForRoute(route);
  const currentPrimary = primaryNavigation.find(
    (item) => item.module === currentModule,
  );
  const secondaryItems = secondaryNavigation[currentModule];

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/health", { signal: controller.signal })
      .then(async (response): Promise<unknown> => {
        if (!response.ok) {
          throw new Error(`Health request failed: ${response.status}`);
        }
        return response.json();
      })
      .then((payload: unknown) => {
        if (!isHealthPayload(payload)) {
          throw new Error("Health response has an unexpected shape");
        }
        setHealth({ status: "connected", service: payload.service });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setHealth({ status: "unavailable" });
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (route !== "health") return;
    const controller = new AbortController();

    void fetch("/api/runtime/claude/preflight", { signal: controller.signal })
      .then(async (response): Promise<unknown> => {
        if (!response.ok) {
          throw new Error(`Claude Runtime request failed: ${response.status}`);
        }
        return response.json();
      })
      .then((payload: unknown) => {
        if (
          typeof payload !== "object" ||
          payload === null ||
          (payload as Record<string, unknown>).ok !== true ||
          !isClaudeRuntimePayload((payload as Record<string, unknown>).value)
        ) {
          throw new Error("Claude Runtime response has an unexpected shape");
        }
        setClaudeRuntime({
          status: "ready",
          value: (payload as { readonly value: ClaudeRuntimePayload }).value,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setClaudeRuntime({
          status: "unavailable",
          message: error instanceof Error ? error.message : "未知错误",
        });
      });

    return () => controller.abort();
  }, [route]);

  useEffect(() => {
    let active = true;
    void requestProjectList().then((result) => {
      if (!active) return;
      if (!result.ok) {
        setProjectContext({ status: "unavailable" });
        return;
      }
      const project = result.value.projects.find(
        (item) => item.projectKey === result.value.currentProjectKey,
      );
      setProjectContext({ status: "ready", project: project ?? null });
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="app-shell">
      <aside className="site-sidebar">
        <header className="site-header">
          <a className="brand" href="/">
            <span className="brand-mark" aria-hidden="true">
              AI
            </span>
            <span>{strings.productName}</span>
          </a>
          <button
            aria-controls="primary-navigation"
            aria-expanded={isNavigationOpen}
            aria-label={isNavigationOpen ? "收起导航" : "打开导航"}
            className="navigation-toggle"
            onClick={() => setIsNavigationOpen((open) => !open)}
            type="button"
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>
        </header>
        <CurrentProjectContext state={projectContext} />
        <nav
          aria-label="一级导航"
          className={`navigation${isNavigationOpen ? " open" : ""}`}
          id="primary-navigation"
        >
          {primaryNavigation.map((item) => {
            const isActive = item.module === currentModule;
            return (
              <a
                aria-current={isActive ? "page" : undefined}
                className={isActive ? "active" : ""}
                href={item.href}
                key={item.module}
              >
                {item.label}
              </a>
            );
          })}
        </nav>
      </aside>

      <div className="site-body">
        <main className={`main-content page-${route}`}>
          <nav
            aria-label={`${currentPrimary?.label ?? "当前模块"}二级导航`}
            className="secondary-navigation"
          >
            <span className="secondary-navigation-title">
              {currentPrimary?.label ?? "当前模块"}
            </span>
            <div className="secondary-navigation-items">
              {secondaryItems.map((item) => {
                const isActive = item.route === route;
                return (
                  <a
                    aria-current={isActive ? "page" : undefined}
                    className={isActive ? "active" : ""}
                    href={item.href}
                    key={item.route}
                  >
                    {item.label}
                  </a>
                );
              })}
            </div>
          </nav>
          {route === "create" ? (
            <ProjectCreationWizard
              onBack={() => {
                window.location.href = "/";
              }}
            />
          ) : route === "overview" ? (
            <ProjectOverview
              onCreate={() => {
                window.location.href = "/projects/new";
              }}
            />
          ) : route === "workflow" ? (
            <WorkflowPage />
          ) : route === "goals" ? (
            <GoalPage />
          ) : route === "roles" ? (
            <RolePage />
          ) : route === "issues" ? (
            <IssuePage />
          ) : route === "reports" ? (
            <ReportPage />
          ) : route === "tasks" ? (
            <TaskPage />
          ) : route === "approvals" ? (
            <ApprovalPage />
          ) : route === "history" ? (
            <HistoryPageView />
          ) : route === "execution" ? (
            <ExecutionConsolePage />
          ) : route === "health" ? (
            <HealthPage health={health} runtime={claudeRuntime} />
          ) : (
            <WorkspaceHome health={health} projectContext={projectContext} />
          )}
        </main>

        <footer className="site-footer">{strings.footer}</footer>
      </div>
    </div>
  );
}
