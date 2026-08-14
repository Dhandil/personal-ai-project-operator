---
schema_version: 1
id: TASK-040
title: 实现续接取消中断标记和恢复报告
status: ready
goal_id: GOAL-008
role: executor
dependencies: [TASK-036, TASK-039]
revision: 2
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T18:15:45Z
approval_id: APPROVAL-003
target_branch: goal/GOAL-008
unblocked_by: TASK-039
---

# TASK-040：实现续接、取消、中断标记和恢复报告

## 目的与范围

保存需要续接的精确会话 ID，处理取消、后端关闭和重启协调，并生成用户恢复选择。

## 验收条件

- 只用精确 session UUID 续接，不使用 `--last`；
- 后端退出时尝试终止子进程并标记 `interrupted`；
- 重启后阻止下一任务，直到用户选择续接、重试或取消。

## 验证

`npm run test:integration -- execution-recovery`，模拟进程和应用重启。

## 预计文件

会话 Repository、进程生命周期协调器、恢复服务、恢复 Route、集成测试。

## 边界与交接

不得自动猜测恢复选择。完成后交给 TASK-041、045。
