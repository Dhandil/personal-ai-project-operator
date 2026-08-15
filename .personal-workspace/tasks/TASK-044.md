---
schema_version: 1
id: TASK-044
title: 实现返工同一审核者复审和自动下一任务
status: ready
goal_id: GOAL-009
role: executor
dependencies: [TASK-036, TASK-042, TASK-043]
revision: 2
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-15T14:20:00Z
approval_id: APPROVAL-004
target_branch: goal/GOAL-009
unblocked_by: TASK-043
---

# TASK-044：实现返工、同一审核者复审和自动下一任务

## 目的与范围

在审核不通过时自动交回执行者，修正后由同一审核角色实例复审，并在获批目标内选择下一任务。

## 验收条件

- `changes_requested` 只能交回执行者写入；
- 复审关联原审核和修正证据；
- 只有目标边界内、依赖满足且无待决策时才自动推进。

## 验证

`npm run test:integration -- review-loop`，覆盖多轮返工和停止条件。

## 预计文件

返工协调器、复审关联策略、下一任务选择器、状态集成测试、流程夹具。

## 边界与交接

不得自动开启新目标或越过用户决策。完成后交给 TASK-045、047。

## 解锁记录

- GOAL-009 已获 APPROVAL-004 批准。
- TASK-036、TASK-042 和 TASK-043 依赖均已完成独立验收。
- TASK-044 现为 `ready`，可由实现对话开始执行；尚未执行或修改实现文件。
