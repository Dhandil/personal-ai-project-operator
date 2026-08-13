---
schema_version: 1
id: TASK-004
title: 配置格式 Lint 类型检查和测试命令
status: draft
goal_id: GOAL-001
role: executor
dependencies: [TASK-001, TASK-002, TASK-003]
revision: 1
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T12:29:07Z
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
