---
schema_version: 1
id: TASK-006
title: 实现项目工作流和阶段模型
status: draft
goal_id: GOAL-002
role: executor
dependencies: [TASK-005]
revision: 1
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T12:29:07Z
---

# TASK-006：实现项目、工作流和阶段模型

## 目的与范围

用纯领域对象表达项目、默认流程、阶段顺序、跳过建议和跳过记录。

## 验收条件

- 默认流程与 Spec 完全一致；
- Agent 只能建议跳过，用户决定后才能记录；
- 非法阶段顺序和缺少理由的跳过被拒绝。

## 验证

`npm run test:unit -- workflow`。

## 预计文件

`packages/domain/package.json`、`tsconfig.json`、`src/project.ts`、`src/workflow.ts`、对应测试。

## 边界与交接

不得依赖文件系统或 Fastify。完成后交给 TASK-007、009。
