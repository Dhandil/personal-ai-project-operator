---
schema_version: 1
id: TASK-005
title: 定义 ID 状态时间和共享数据契约
status: ready
goal_id: GOAL-002
role: executor
dependencies: [TASK-004]
revision: 2
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T01:06:42Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-004
---

# TASK-005：定义 ID、状态、时间和共享数据契约

## 目的与范围

为正式记录定义不可变 ID、状态枚举、UTC 时间和 Zod 输入输出契约。

## 验收条件

- 所有确认的 ID 前缀和状态可校验；
- 非法 ID、状态和时间被拒绝；
- 契约可以被 Web 与 Server 共同导入。

## 验证

`npm run test:unit -- contracts`；`npm run typecheck`。

## 预计文件

`packages/contracts/package.json`、`tsconfig.json`、`src/identifiers.ts`、`src/statuses.ts`、`src/index.ts`及同文件测试。

## 边界与交接

不得增加未确认状态或 ID 类型。完成后解锁 TASK-006～008。
