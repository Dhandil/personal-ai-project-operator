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

function isHealthPayload(value: unknown): value is HealthPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return payload.status === "ok" && typeof payload.service === "string";
}

export function App(): ReactElement {
  const [health, setHealth] = useState<HealthState>({ status: "checking" });
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
        <main className="main-content">
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
          ) : (
            <>
              <ProjectOverview
                onCreate={() => {
                  window.location.href = "/projects/new";
                }}
              />
              <section className="hero-card" aria-labelledby="page-title">
                <p className="eyebrow">{strings.home.eyebrow}</p>
                <h1 id="page-title">{strings.home.title}</h1>
                <p className="tagline">{strings.tagline}</p>
                <p className="description">{strings.home.description}</p>
                <a className="button primary hero-action" href="/projects/new">
                  新建项目 →
                </a>
              </section>

              <section className="status-card" aria-labelledby="health-title">
                <div>
                  <p className="eyebrow">
                    {route === "health" ? "HEALTH" : "SYSTEM"}
                  </p>
                  <h2 id="health-title">{strings.health.title}</h2>
                  <p className="description">{strings.health.endpoint}</p>
                </div>
                <div className={`health-state ${health.status}`} role="status">
                  <span className="status-dot" aria-hidden="true" />
                  <span>
                    {health.status === "checking" && strings.health.checking}
                    {health.status === "connected" &&
                      `${strings.health.connected} 路 ${health.service}`}
                    {health.status === "unavailable" &&
                      strings.health.unavailable}
                  </span>
                </div>
              </section>
            </>
          )}
        </main>

        <footer className="site-footer">{strings.footer}</footer>
      </div>
    </div>
  );
}
