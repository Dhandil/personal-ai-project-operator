---
schema_version: 1
id: TASK-001
title: 建立 npm Workspace 和 TypeScript 根配置
status: draft
goal_id: GOAL-001
role: executor
dependencies: []
revision: 1
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T12:29:07Z
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
