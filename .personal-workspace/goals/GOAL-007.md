---
schema_version: 1
id: GOAL-007
title: 建立 Git 执行隔离
status: draft
revision: 1
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T12:29:07Z
tasks: [TASK-032, TASK-033, TASK-034]
---

# GOAL-007：建立 Git 执行隔离

## 目标

在接入真实 Agent 前，建立目标分支、任务分支、Worktree、差异校验、规范提交和受控合并能力。

## 验收

- 每个任务在独立 Worktree 中执行；
- 越界变更不能合入目标分支；
- `main` 合并必须由用户批准。
