---
schema_version: 1
id: TASK-062
title: 定义项目经理状态与下一行动策略
status: draft
goal_id: GOAL-013
role: executor
dependencies: [TASK-061]
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
target_branch: goal/GOAL-013
unblocked_by: GOAL-012
---

# TASK-062：定义项目经理状态与下一行动策略

## 目的与范围

从正式项目事实确定当前目标、任务、责任角色、阻塞和推荐下一行动，项目经理自身不成为新的事实源。

## 验收条件

- 定义项目运营快照和继续、等待审核、等待用户、恢复、阻塞、完成等行动类型；
- 下一行动由领域策略根据依赖、审批、问题、决策和执行状态确定；
- 多个候选任务时使用确定性规则并解释选择原因；
- 不允许项目经理自行创建获批目标、扩大范围或越过审批；
- 过期、冲突或缺失事实返回恢复建议而不是猜测。

## 验证

运行行动选择和非法边界单元测试，再运行 `npm run verify`。

## 边界与交接

不运行 Agent、不实现定时器或 UI。完成后 TASK-063 可申请解锁。
