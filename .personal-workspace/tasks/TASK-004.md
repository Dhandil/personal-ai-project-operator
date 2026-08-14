---
schema_version: 1
id: TASK-004
title: 配置格式 Lint 类型检查和测试命令
status: completed
goal_id: GOAL-001
role: executor
dependencies: [TASK-001, TASK-002, TASK-003]
revision: 3
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T00:58:01Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-003
---

# TASK-004：配置格式、Lint、类型检查和测试命令

## 目的与范围

建立 Spec 中定义的根级质量命令、Vitest Workspace 和 Playwright Chromium 基线。

## 验收条件

- 所有约定命令存在且空项目可执行；
- `verify` 顺序与 Spec 一致；
- 不以跳过或忽略错误换取通过。

## 验证

`npm run format:check`、`npm run lint`、`npm run typecheck`、`npm run test:unit`、`npm run build`。

## 预计文件

根 `package.json`、ESLint 配置、Prettier 配置、Vitest 配置、Playwright 配置。

## 边界与交接

不得删除或弱化严格 TypeScript 选项。完成后提交 GOAL-001 检查点。

## 完成输出

- 状态：`completed`
- 输出：根级 Prettier、ESLint、TypeScript、Vitest 4 projects、Playwright Chromium 配置和统一 npm 命令编排。
- `verify` 固定执行：`format:check → lint → typecheck → test:unit → test:integration → test:e2e → build`。
- 保留并复用 server/web 现有入口；未删除或弱化 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`。
- 未实现数据库、Codex CLI、业务领域模块或 GOAL-002 及后续目标功能。

## 验证证据

- `npm install --ignore-scripts --no-audit --no-fund`：通过，锁定质量工具依赖。
- `npm run format:check`：通过。
- `npm run lint`：通过。
- `npm run typecheck`：通过，server/web 两个 workspace 均通过。
- `npm run test:unit`：通过，Vitest 4.1.10 的 server/web 两个项目共 2 个测试文件、3 个测试通过。
- `npm run test:integration`：通过，后端健康检查 1 个测试通过。
- `npm run test:coverage`：通过，覆盖率报告由 `@vitest/coverage-v8` 生成；当前骨架覆盖率未设置人为阈值，后续 Domain 任务按 Spec 覆盖规则补充测试。
- `npm run test:e2e`：通过，Playwright Chromium 冒烟测试 1/1；临时启动 server/web 并验证首页产品名和后端连接状态。
- `npm run build`：通过，server TypeScript 编译和 web Vite 生产构建均成功。
- `npm run verify`：通过，完整顺序与 Spec 一致。
- `git diff --check`：通过；测试生成物和临时进程已清理。

## 提交与交接

- 提交：GOAL-001 检查点提交（commit message 包含 `Tasks: TASK-004`）。
- 交接：GOAL-001 的 TASK-001～TASK-004 已完成；后续目标仍须依照正式审批和依赖顺序启动。
- 遗留问题：无。
