---
schema_version: 1
id: TASK-036
title: 实现单执行链协调器
status: in_review
goal_id: GOAL-008
role: executor
dependencies: [TASK-023, TASK-025, TASK-026, TASK-035]
revision: 4
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T16:45:05Z
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

## 完成证据

- 新增 `ExecutionCoordinatorService`、`ExecutionLock` 和执行 API，按已批准目标、任务依赖、问题/决策影响和恢复条件选择任务；
- 任务启动前转换为 `in_progress`，成功结果进入 `in_review`，失败进入 `blocked`，中断或权限越界进入 `paused`；
- 单进程共享运行锁拒绝并行项目或任务执行，Fake Adapter 支持中断后使用同一 EXEC ID 续接；
- 专项集成测试通过：5/5，覆盖单执行链锁、依赖阻塞、暂停恢复、Blocker 和 API；
- 完整 `npm run verify` 通过：64 个单元测试、74 个集成测试、14 个 Playwright 测试，以及格式、Lint、类型检查和构建。

## 边界与交接

不支持并行项目或任务执行。完成后交给 TASK-040、042、044。

## 交接

- 当前状态为 `in_review`，等待独立验收；
- 执行成功只代表产出已提交审核，不代表任务自动完成；
- 后续应由审核者检查实际差异、结构化结果和验证证据，再决定是否交给 TASK-040、TASK-042、TASK-044。
