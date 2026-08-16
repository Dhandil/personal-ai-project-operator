import { describe, expect, it } from "vitest";

import {
  navigationModuleForRoute,
  primaryNavigation,
  resolveRoute,
  secondaryNavigation,
} from "./app";

describe("resolveRoute", () => {
  it("keeps the home route as the default", () => {
    expect(resolveRoute("/")).toBe("home");
    expect(resolveRoute("/unknown")).toBe("home");
  });

  it("recognizes the health route", () => {
    expect(resolveRoute("/health")).toBe("health");
  });

  it("recognizes the project creation route", () => {
    expect(resolveRoute("/projects/new")).toBe("create");
  });

  it("recognizes the project overview route", () => {
    expect(resolveRoute("/projects")).toBe("overview");
  });

  it("recognizes the workflow route", () => {
    expect(resolveRoute("/projects/workflow")).toBe("workflow");
  });

  it("recognizes the goals route", () => {
    expect(resolveRoute("/projects/goals")).toBe("goals");
  });

  it("recognizes the roles route", () => {
    expect(resolveRoute("/projects/roles")).toBe("roles");
  });

  it("recognizes the issues route", () => {
    expect(resolveRoute("/projects/issues")).toBe("issues");
  });

  it("recognizes the reports route", () => {
    expect(resolveRoute("/projects/reports")).toBe("reports");
  });

  it("recognizes the tasks route", () => {
    expect(resolveRoute("/projects/tasks")).toBe("tasks");
  });

  it("recognizes the execution console route", () => {
    expect(resolveRoute("/projects/execution")).toBe("execution");
  });
});

describe("two-level navigation", () => {
  it("exposes exactly the five primary modules", () => {
    expect(primaryNavigation.map((item) => item.label)).toEqual([
      "工作台",
      "项目",
      "执行",
      "治理",
      "系统",
    ]);
  });

  it("maps every primary module to the required secondary pages", () => {
    expect(
      Object.fromEntries(
        Object.entries(secondaryNavigation).map(([module, items]) => [
          module,
          items.map((item) => item.label),
        ]),
      ),
    ).toEqual({
      workspace: ["项目列表", "新建项目"],
      projects: ["概览", "工作流", "目标", "任务", "角色"],
      execution: ["执行控制台", "运行报告"],
      governance: ["审批", "问题与决策", "历史"],
      system: ["服务状态"],
    });
  });

  it("resolves the primary module for every deep-linked route", () => {
    expect(navigationModuleForRoute("home")).toBe("workspace");
    expect(navigationModuleForRoute("create")).toBe("workspace");
    expect(navigationModuleForRoute("overview")).toBe("projects");
    expect(navigationModuleForRoute("roles")).toBe("projects");
    expect(navigationModuleForRoute("execution")).toBe("execution");
    expect(navigationModuleForRoute("reports")).toBe("execution");
    expect(navigationModuleForRoute("approvals")).toBe("governance");
    expect(navigationModuleForRoute("history")).toBe("governance");
    expect(navigationModuleForRoute("health")).toBe("system");
  });

  it("keeps every navigation route and destination unique", () => {
    const primaryItems = primaryNavigation;
    const secondaryItems = Object.values(secondaryNavigation).flat();

    expect(new Set(primaryItems.map((item) => item.module)).size).toBe(
      primaryItems.length,
    );
    expect(new Set(primaryItems.map((item) => item.href)).size).toBe(
      primaryItems.length,
    );
    expect(new Set(secondaryItems.map((item) => item.href)).size).toBe(
      secondaryItems.length,
    );
  });
});
