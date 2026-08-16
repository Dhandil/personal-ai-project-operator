---
schema_version: 1
id: TASK-067
title: 实现项目运营控制台
status: draft
goal_id: GOAL-013
role: executor
dependencies: [TASK-064, TASK-065, TASK-066]
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
target_branch: goal/GOAL-013
unblocked_by: TASK-066
---

# TASK-067：实现项目运营控制台

## 目的与范围

让用户在一个页面看到项目经理建议、当前执行、定期摘要、阻塞和待决策事项，并完成每日启动或恢复。

## 验收条件

- 首屏展示目标、当前动作、责任角色、进度、风险、下一步和用户待办；
- 可每日启动、暂停、恢复、取消和请求即时报告；
- 普通报告与需要审批的决策清晰区分；
- 阻塞和变更建议可跳转到对应问题、决策和任务；
- 刷新后准确恢复，不重复启动执行链；
- 桌面和窄屏可访问性测试通过。

## 验证

运行组件、SSE/刷新恢复和 Playwright 运营场景，再运行 `npm run verify`。

## 边界与交接

不增加外部通知或后台服务。完成后 TASK-068 可申请解锁。
