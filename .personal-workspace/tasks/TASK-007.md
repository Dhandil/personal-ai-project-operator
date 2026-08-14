---
schema_version: 1
id: TASK-007
title: 实现短期目标角色和任务卡模型
status: ready
goal_id: GOAL-002
role: executor
dependencies: [TASK-005, TASK-006]
revision: 2
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T01:40:19Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-006
---

# TASK-007：实现短期目标、角色和任务卡模型

## 目的与范围

表达短期目标边界、角色上下文、任务依赖、允许路径和轻量自定义字段。

## 验收条件

- 未获批目标不能产生可执行任务；
- 角色、Agent 和 CLI 会话相互解耦；
- 必填字段不可删除，支持已确认的简单自定义字段类型。

## 验证

`npm run test:unit -- goal role task`。

## 预计文件

`src/goal.ts`、`src/role.ts`、`src/task.ts`、`src/custom-field.ts`、对应测试。

## 边界与交接

不实现复杂表单或自定义审批门。完成后解锁 TASK-008、009。
