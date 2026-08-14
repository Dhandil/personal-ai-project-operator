---
schema_version: 1
id: GOAL-007
title: 建立 Git 执行隔离
status: ready
revision: 2
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T13:43:29Z
tasks: [TASK-032, TASK-033, TASK-034]
approval_ids: [APPROVAL-002]
target_branch: goal/GOAL-007
unblocked_by: TASK-031
---

# GOAL-007：建立 Git 执行隔离

## 目标

在接入真实 Agent 前，建立目标分支、任务分支、Worktree、差异校验、规范提交和受控合并能力。

## 验收

- 每个任务在独立 Worktree 中执行；
- 越界变更不能合入目标分支；
- `main` 合并必须由用户批准。

## 当前状态

- 用户已接受 REPORT-032，批准进入本目标；
- 本目标已进入 `ready`，但尚未自动启动；
- TASK-032 已按依赖解锁，TASK-033 和 TASK-034 仍等待前置任务。
