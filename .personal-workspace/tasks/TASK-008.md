---
schema_version: 1
id: TASK-008
title: 实现审批问题决策和交接模型
status: ready
goal_id: GOAL-002
role: executor
dependencies: [TASK-005, TASK-006, TASK-007]
revision: 2
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T02:09:58Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-007
---

# TASK-008：实现审批、问题、决策和交接模型

## 目的与范围

表达五类审批、问题与讨论、用户决策、交接、报告和执行记录之间的关联。

## 验收条件

- 正式记录具有不可变 ID、revision 和关联对象；
- 问题可以精确标记受影响任务；
- 交接必须引用实际输出和验证证据。

## 验证

`npm run test:unit -- governance-records`。

## 预计文件

`src/approval.ts`、`src/issue.ts`、`src/decision.ts`、`src/handoff.ts`、对应测试。

## 边界与交接

报告文本不得自动成为完成证据。完成后交给 TASK-009。
