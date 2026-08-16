---
schema_version: 1
id: TASK-066
title: 实现批准边界内的角色调度与自动推进
status: draft
goal_id: GOAL-013
role: executor
dependencies: [TASK-063, TASK-065]
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
target_branch: goal/GOAL-013
unblocked_by: TASK-065
---

# TASK-066：实现批准边界内的角色调度与自动推进

## 目的与范围

由项目经理根据确定性下一行动，在已批准目标内调用执行者、审核者和复审者，完成标准交接。

## 验收条件

- 只选择依赖、审批、问题、决策和恢复条件均满足的任务；
- 角色任务包使用当前事实，不复用前一角色聊天历史；
- 执行、审核、返工和复审继续复用现有只读和成果校验边界；
- 每次交接记录完成内容、证据、下一责任角色和用户操作；
- 到达审批门、范围边界或目标完成时停止自动推进。

## 验证

使用 Fake Adapter 运行多任务调度、审核退回、阻塞和停止门集成测试，再运行 `npm run verify`。

## 边界与交接

保持单执行链，不启动新目标或合入 `main`。完成后 TASK-067 可申请解锁。
