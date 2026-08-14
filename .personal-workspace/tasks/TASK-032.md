---
schema_version: 1
id: TASK-032
title: 实现目标分支任务分支和 Worktree 生命周期
status: ready
goal_id: GOAL-007
role: executor
dependencies: [TASK-016, TASK-031]
revision: 2
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T13:43:29Z
approval_id: APPROVAL-002
target_branch: goal/GOAL-007
unblocked_by: TASK-031
---

# TASK-032：实现目标分支、任务分支和 Worktree 生命周期

## 目的与范围

为每个获批目标创建目标分支，为每个执行任务创建独立分支和运行目录下的 Worktree。

## 验收条件

- 分支和 Worktree 命名稳定并关联 GOAL/TASK；
- 创建、查询、保留和安全清理生命周期可恢复；
- 不允许两个执行占用同一任务 Worktree。

## 验证

`npm run test:integration -- git-worktree`，仅使用临时仓库。

## 预计文件

Worktree 端口、Git Worktree Adapter、命名策略、生命周期服务、集成测试。

## 边界与交接

不执行 Commit 或 Merge。清理前必须验证绝对目标位于运行目录。完成后交给 TASK-033、034。
