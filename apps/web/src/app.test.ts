import { describe, expect, it } from "vitest";

import { navigationGroups, resolveRoute } from "./app";

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

describe("navigationGroups", () => {
  it("organizes every page into the three information architecture groups", () => {
    expect(
      navigationGroups.map((group) => ({
        label: group.label,
        items: group.items.map((item) => item.label),
      })),
    ).toEqual([
      {
        label: "工作区",
        items: ["项目首页", "新建项目", "服务状态"],
      },
      {
        label: "当前项目",
        items: ["项目总览", "工作流", "目标与任务", "任务卡", "角色"],
      },
      {
        label: "运行与治理",
        items: ["执行", "审批", "问题与决策", "历史", "报告"],
      },
    ]);
  });

  it("keeps every navigation route and destination unique", () => {
    const items = navigationGroups.flatMap((group) => group.items);

    expect(new Set(items.map((item) => item.route)).size).toBe(items.length);
    expect(new Set(items.map((item) => item.href)).size).toBe(items.length);
  });
});
