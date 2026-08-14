---
schema_version: 1
id: TASK-013
title: 从领域事实生成唯一 status.md 快照
status: ready
goal_id: GOAL-003
role: executor
dependencies: [TASK-011, TASK-012]
revision: 2
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T04:12:05Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-012
---

# TASK-013：从领域事实生成唯一 `status.md` 快照

## 目的与范围

从目标、任务、审批、问题、决策、交接和报告生成启动简报所需的唯一当前摘要。

## 验收条件

- 删除 `status.md` 后可完全重建；
- 快照不包含无法从事实解释的状态；
- 冲突时事实文件优先，快照只重建不反向覆盖。

## 验证

`npm run test:integration -- status-projection`。

## 预计文件

状态投影服务、快照渲染器、读取端口、集成测试和夹具。

## 边界与交接

不得把快照作为可独立编辑的事实。完成后交给 TASK-014、020。
