---
schema_version: 1
id: TASK-065
title: 实现阻塞变更与决策升级流程
status: draft
goal_id: GOAL-013
role: executor
dependencies: [TASK-062, TASK-064]
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
target_branch: goal/GOAL-013
unblocked_by: TASK-064
---

# TASK-065：实现阻塞变更与决策升级流程

## 目的与范围

让项目经理发现问题、范围变化或缺失决策时暂停受影响工作，提供建议并交给用户决定。

## 验收条件

- 区分普通进度、可自动恢复阻塞、需要用户决策和范围变更；
- 受影响任务按问题关系暂停，不影响无关事实；
- 项目经理提供选项、影响、推荐和恢复条件，但不能代替用户选择；
- 用户决定后更新决策、任务状态和审计，并重新计算下一行动；
- 重复或过期决定被拒绝并提供刷新提示。

## 验证

运行问题影响、变更建议、审批快照和恢复测试，再运行 `npm run verify`。

## 边界与交接

不自动修改已批准目标范围。完成后 TASK-066 可申请解锁。
