---
schema_version: 1
id: TASK-007
title: 实现短期目标角色和任务卡模型
status: completed
goal_id: GOAL-002
role: executor
dependencies: [TASK-005, TASK-006]
revision: 6
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T02:09:58Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-006
verification_report_id: REPORT-008
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

## Completion

- Status: `completed`.
- Output: exported immutable short-term goal, role, task-card, and lightweight custom-field domain models from `@personal-ai-operator/domain`.
- Approval gate: an unapproved goal can only produce a `draft` task; `markTaskReady` requires a user-approved goal.
- Decoupling: role templates contain stable responsibilities and permissions only; they do not bind an Agent or CLI session.
- Required fields: task-card fields are required in the immutable `Task` type and updates preserve them.
- Custom fields: supports `text`, `number`, `boolean`, `date`, `single_select`, and `file_reference`.

## Verification evidence

- `npm run test:unit -- goal role task`: 8 tests passed.
- Rework regression: `updateTask(task, { onDemandFiles: [] })` and `updateTask(task, { evidence: [] })` both return `invalid_task`.
- `npm run test:unit -- goal role task`: 9 tests passed, including both required-field clearing regressions.
- `npm run verify`: format check, lint, all workspace type checks, 31 unit tests, 1 integration test, 1 Playwright Chromium test, and all workspace builds passed.
- `git diff --check`: passed.

## Handoff

- TASK-008 and TASK-009 were not implemented in this task.
- TASK-008 still requires this task; TASK-009 additionally requires TASK-008.
