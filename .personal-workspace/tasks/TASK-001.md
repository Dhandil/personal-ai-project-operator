---
schema_version: 1
id: TASK-001
title: 建立 npm Workspace 和 TypeScript 根配置
status: completed
goal_id: GOAL-001
role: executor
dependencies: []
revision: 3
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T13:53:33Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
---

# TASK-001：建立 npm Workspace 和 TypeScript 根配置

## 目的与范围

建立仓库级 npm Workspaces、Node 24 和严格 TypeScript 基线，不加入尚未使用的运行时依赖。

## 验收条件

- Workspace 能识别 `apps/*` 与 `packages/*`；
- TypeScript 基线启用 Spec 要求的严格选项；
- 锁文件可由 `npm install` 生成并由 `npm ci` 重放。

## 验证

`npm ci`；检查 Workspace 列表和根配置。

## 预计文件

`package.json`、`package-lock.json`、`tsconfig.base.json`、`.gitignore`、`.editorconfig`。

## 边界与交接

不得创建业务代码或加入未获批依赖。完成后交给 TASK-002 与 TASK-003。

## 完成输出

- 状态：`completed`
- 输出：仓库级 npm Workspace、Node 24 引擎约束、严格 TypeScript 根配置、编辑器配置、Git 忽略规则和 npm lockfile。
- 未创建业务代码，未加入运行时依赖或后续任务依赖。

## 验证证据

- `node --version`：`v24.18.0`
- `npm --version`：`11.16.0`
- `npm install --ignore-scripts --no-audit --no-fund`：通过。
- `npm ci --ignore-scripts --no-audit --no-fund`：通过。
- `npm pkg get workspaces --json`：返回 `apps/*` 与 `packages/*`。
- `package-lock.json`：lockfile v3，根 package 条目保留两个 workspace 模式。
- `tsconfig.base.json`：启用 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes` 及其余根级严格检查选项。
- `npm ls --workspaces --depth=0` 当前因后续任务尚未创建具体 workspace 子包而无可列举对象；未通过提前创建后续任务代码规避该边界。

## 提交与交接

- 提交：本任务验收提交（commit message 包含 `Tasks: TASK-001`）。
- 交接：TASK-002 与 TASK-003 可在本目标分支继续创建具体 workspace 子包；TASK-004 可在此根配置上补充质量命令和开发依赖。
- 遗留问题：无。
