---
schema_version: 1
id: TASK-047
title: 完成 V0.2 全链路验收
status: draft
goal_id: GOAL-009
role: reviewer
dependencies: [TASK-034, TASK-048]
revision: 2
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-15T08:04:00Z
approval_id: APPROVAL-004
target_branch: goal/GOAL-009
unblocked_by: TASK-048
---

# TASK-047：完成 V0.2 全链路验收

## 目的与范围

以新 Agent 和临时项目完成“批准目标—执行—审核—返工—复审—提交—交接—恢复”的最终验收。

## 验收条件

- 新 Agent 不读取前一 Agent 聊天历史即可继续；
- 未授权修改不能进入目标分支，所有异常可恢复和追溯；
- 任务合入目标分支后，仍需用户批准才可合入 `main`。

## 路线调整

- 当前 V0.2 全链路验收优先使用 TASK-048 的 Claude Code CLI Adapter。
- TASK-046 的 Codex CLI 真实验收已暂停存档，不再阻塞本任务的 Claude Code 验收路线；TASK-047 仍保持 `draft`，不会自动启动。

## 验证

`npm run verify`、`npm run test:codex-cli`，并由用户审核 V0.2 验收报告和目标分支。

## 预计文件

V0.2 E2E 场景、全链路夹具、验收报告、Dogfooding 指标报告和必要测试辅助文件。

## 边界与交接

审核任务不得直接修复发现；缺陷创建新任务。用户决定是否合入 `main` 以及下一阶段方向。
