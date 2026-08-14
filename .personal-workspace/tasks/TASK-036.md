---
schema_version: 1
id: TASK-036
title: 实现单执行链协调器
status: ready
goal_id: GOAL-008
role: executor
dependencies: [TASK-023, TASK-025, TASK-026, TASK-035]
revision: 3
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T16:08:23Z
approval_id: APPROVAL-003
target_branch: goal/GOAL-008
unblocked_by: TASK-035
---

# TASK-036：实现单执行链协调器

## 目的与范围

在已批准目标内选择就绪任务、启动角色执行、应用状态转换，并维持全局唯一活动 Agent 链。

## 验收条件

- 未满足依赖、审批或恢复条件的任务不能启动；
- 同一时间最多一个活动 Agent 执行链；
- 问题、Blocker 或用户决策需求能暂停正确范围。

## 验证

`npm run test:integration -- execution-coordinator`，使用 Fake Adapter。

## 预计文件

执行协调服务、运行锁、任务选择策略、执行 API Route、集成测试。

## 边界与交接

不支持并行项目或任务执行。完成后交给 TASK-040、042、044。
