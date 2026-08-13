---
schema_version: 1
id: TASK-002
title: 建立 Fastify 后端骨架和健康检查
status: completed
goal_id: GOAL-001
role: executor
dependencies: [TASK-001]
revision: 4
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T14:14:02Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-001
verification_report_id: REPORT-002
---

# TASK-002：建立 Fastify 后端骨架和健康检查

## 目的与范围

建立可启动、只绑定本机地址的 Fastify 应用，并提供无业务依赖的健康检查。

## 验收条件

- 默认监听 `127.0.0.1:4300`；
- 健康接口返回稳定结构；
- 应用构造与进程启动分离，便于测试。

## 验证

运行后端专项集成测试并手工请求健康接口。

## 预计文件

`apps/server/package.json`、`apps/server/tsconfig.json`、`apps/server/src/app.ts`、`apps/server/src/main.ts`、对应测试。

## 边界与交接

不加入业务模块、数据库或静态前端服务。完成后为 TASK-003、004 提供后端入口。

## 完成输出

- 状态：`completed`
- 输出：`apps/server` Fastify workspace、独立的 `buildApp()` 应用构造、`main.ts` 启动入口、`/health` 健康检查和专项集成测试。
- 默认监听：`127.0.0.1:4300`。
- 未加入业务模块、数据库、静态前端服务或 TASK-003/TASK-004 实现。

## 验证证据

- `npm install --workspace apps/server --ignore-scripts --no-audit --no-fund`：通过并更新 `package-lock.json`。
- `npm ls --workspaces --depth=0`：识别 `@personal-ai-operator/server@0.0.0`。
- 解析锁文件：Fastify `5.11.3`，lockfile v3。
- `npm run test:integration --workspace apps/server`：通过，1 个测试通过、0 个失败。
- `npm exec --workspace apps/server -- tsc --noEmit -p tsconfig.json`：通过。
- 手工启动 `npm run dev --workspace apps/server` 后请求 `http://127.0.0.1:4300/health`：HTTP 200，响应为 `{"status":"ok","service":"@personal-ai-operator/server"}`。
- 手工验证进程已清理，Git 变更范围仅包含 TASK-002 实现、锁文件和任务记录。

## 提交与交接

- 提交：本任务验收提交（commit message 包含 `Tasks: TASK-002`）。
- 交接：TASK-003、TASK-004 可复用 `apps/server` 的后端入口和 workspace 配置；TASK-003 仍不得由本任务提前实现。
- 遗留问题：无。

## 独立核验

- 核验报告：`REPORT-002`；
- 核验结论：通过；
- 核验提交：`554a100791c15b46b4788e953c7d07460e08f586`；
- 项目负责人独立重跑根级 `npm ci --ignore-scripts --no-audit --no-fund`、后端集成测试和 TypeScript 检查，结果通过；
- 使用编译产物短暂启动真实进程并请求 `127.0.0.1:4300/health`，返回 HTTP 200 和预期 JSON；
- 初次直接启动 `tsx` 的 ENOMEM 是当前沙箱的系统环境限制，已通过编译后进程验证绕过，未发现应用缺陷。
