---
schema_version: 1
id: TASK-006
title: 实现项目工作流和阶段模型
status: completed
goal_id: GOAL-002
role: executor
dependencies: [TASK-005]
revision: 4
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T01:40:19Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-005
verification_report_id: REPORT-006
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

## 完成输出

- 状态：`completed`
- 输出：`@personal-ai-operator/domain` workspace，提供项目创建、默认工作流、阶段顺序、阶段启动/完成和跳过建议/用户批准模型。
- 默认流程严格实现 Spec 的 10 个阶段：想法澄清、问题定义、用户场景、Discovery 验证、产品需求、MVP 范围、系统方案、开发计划、第一个短期目标、执行。
- Agent 只能生成 `StageSkipProposal`；只有 `decidedBy: 'user'` 且批准理由非空时，阶段才记录为 `skipped`。
- 工作流操作均返回不可变领域结果；非法阶段顺序、非法转换和缺少理由会返回可辨识错误。
- 未依赖文件系统、Fastify 或数据库，未实现 TASK-007～009。

## 验证证据

- `npm ci --ignore-scripts --no-audit --no-fund`：通过。
- `npm run test:unit -- workflow`：通过，workflow 测试 1 个文件、8 个测试通过。
- `npm run typecheck`：通过，domain/contracts/server/web 四个 workspace 均通过。
- `npm run lint`、`npm run format:check`：均通过。
- `npm run build`：通过，contracts/domain/server/web 构建均成功。
- `npm run verify`：通过，Vitest 5 个测试文件、19 个测试，后端集成 1 个测试，Playwright Chromium 1 个测试及全部构建均通过。
- `git diff --check`：通过；生成物和临时服务已清理。

## 提交与交接

- 提交：本任务验收提交（commit message 包含 `Tasks: TASK-006`）。
- 交接：TASK-007、TASK-009 可复用项目和工作流模型；TASK-008 仍须等待其依赖完成。未修改 GOAL-002 状态或提前实现后续任务。
- 遗留问题：无。
