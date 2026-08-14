---
schema_version: 1
id: TASK-037
title: 生成角色任务包和结构化输出 Schema
status: ready
goal_id: GOAL-008
role: executor
dependencies: [TASK-024, TASK-025, TASK-035]
revision: 2
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T13:13:29Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-035
---

# TASK-037：生成角色任务包和结构化输出 Schema

## 目的与范围

根据项目、角色和任务事实生成最小但充分的 Agent 输入包与角色专属结果 Schema。

## 验收条件

- 包含职责、必读、任务边界、实际项目路径、验证和交接要求；
- 不包含无关完整历史聊天；
- 执行者与审核者使用不同输出 Schema 和权限说明。

## 验证

`npm run test:unit -- task-package`；使用固定夹具快照检查。

## 预计文件

上下文路由器、任务包构建器、执行结果 Schema、审核结果 Schema、测试。

## 边界与交接

不得把所有项目文件默认塞入上下文。完成后交给 TASK-039、043。
