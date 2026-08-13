---
schema_version: 1
id: TASK-009
title: 实现状态转换审批门和完成判定策略
status: draft
goal_id: GOAL-002
role: executor
dependencies: [TASK-006, TASK-007, TASK-008]
revision: 1
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T12:29:07Z
---

# TASK-009：实现状态转换、审批门和完成判定策略

## 目的与范围

集中实现状态机、审批门、问题暂停和任务完成的确定性领域策略。

## 验收条件

- 所有非法状态转换均被拒绝；
- 未获批目标、未通过审核或证据不足不能完成；
- 问题只暂停确定受影响任务，范围未知时暂停执行链。

## 验证

`npm run test:unit -- policies`；检查关键分支覆盖率。

## 预计文件

`src/task-transition.ts`、`src/approval-policy.ts`、`src/completion-policy.ts`、`src/issue-impact-policy.ts`、对应测试。

## 边界与交接

不能把策略藏入 UI 或基础设施。完成后提交 GOAL-002 检查点。
