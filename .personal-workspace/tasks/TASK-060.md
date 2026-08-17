---
schema_version: 1
id: TASK-060
title: 实现项目前期规划控制台
status: ready
goal_id: GOAL-012
role: executor
dependencies: [TASK-058, TASK-059]
revision: 2
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-17T11:50:00Z
target_branch: goal/GOAL-012
unblocked_by: TASK-059
---

# TASK-060：实现项目前期规划控制台

## 目的与范围

提供从项目想法、阶段运行、产物审核到规划草案批准的一条清晰用户路径。

## 验收条件

- 用户可查看当前阶段、责任角色、进度、产物、风险和推荐下一步；
- 可启动/恢复/取消当前阶段，不能跳过未满足的审批门；
- 阶段产物候选与正式版本清晰区分；
- 规划草案可查看依赖、角色和验收条件，并统一批准或退回；
- 批准后直接链接到新目标、首个任务和执行控制台；
- 刷新和重启后从事实恢复，不依赖浏览器内存。

## 验证

运行组件测试、阶段/规划 Playwright 场景和完整 `npm run verify`。

## 边界与交接

UI 不隐藏领域规则，不伪造自动执行结果。完成后 TASK-061 可申请解锁。
