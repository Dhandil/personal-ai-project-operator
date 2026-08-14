---
schema_version: 1
id: TASK-003
title: 建立 React Vite 和中文界面骨架
status: completed
goal_id: GOAL-001
role: executor
dependencies: [TASK-001, TASK-002]
revision: 4
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T00:39:25Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-002
verification_report_id: REPORT-003
---

# TASK-003：建立 React、Vite 和中文界面骨架

## 目的与范围

建立 React/Vite Web 入口、基础路由和集中中文字符串，并验证能连接健康接口。

## 验收条件

- 开发首页可以打开并显示中文产品名；
- Web 通过 HTTP 调用后端健康接口；
- 生产构建成功。

## 验证

`npm run build`；手工打开首页并确认健康状态。

## 预计文件

`apps/web/package.json`、`apps/web/tsconfig.json`、`apps/web/vite.config.ts`、`apps/web/index.html`、`apps/web/src/main.tsx`。

## 边界与交接

不实现正式功能页面或全局复杂状态。完成后交给 TASK-004。

## 完成输出

- 状态：`completed`
- 输出：`apps/web` React/Vite workspace、中文字符串集中管理、首页、基础 `/health` 路由、Vite 健康接口代理和响应式基础样式。
- Web 开发服务器默认绑定 `127.0.0.1:5173`，通过 `/health` 调用后端 `127.0.0.1:4300`。
- 未实现正式业务页面、全局复杂状态或 TASK-004 的质量命令编排。

## 验证证据

- `npm ci --ignore-scripts --no-audit --no-fund`：通过。
- `npm ls --workspaces --depth=0`：识别 `@personal-ai-operator/web@0.0.0`，React `19.2.8`、Vite `8.2.1`。
- `npm run build --workspace apps/web`：通过，Vite 生产构建生成 `dist/index.html` 和静态资源。
- `npm exec --workspace apps/web -- tsc --noEmit -p tsconfig.json`：通过。
- Vite 开发服务器首页 HTTP 200；通过 `/health` 代理请求后端返回 HTTP 200 和 `{"status":"ok","service":"@personal-ai-operator/server"}`。
- 浏览器实际渲染首页显示“个人 AI 项目运营工具”；通过“服务状态”导航后路由处于 active 状态，并显示“后端服务已连接 · @personal-ai-operator/server”。
- 验证进程和浏览器页面已清理，`git diff --check` 通过。

## 提交与交接

- 提交：本任务验收提交（commit message 包含 `Tasks: TASK-003`）。
- 交接：TASK-004 可在现有两个 workspace 和前后端构建入口上补充格式、Lint、类型检查和测试命令。
- 遗留问题：无。
