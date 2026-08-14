---
schema_version: 1
id: TASK-032
title: 实现目标分支任务分支和 Worktree 生命周期
status: completed
goal_id: GOAL-007
role: executor
dependencies: [TASK-016, TASK-031]
revision: 4
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T14:05:08Z
approval_id: APPROVAL-002
target_branch: goal/GOAL-007
unblocked_by: TASK-031
verification_report_id: REPORT-034
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

## 完成证据

- 新增 Git Worktree Adapter 与生命周期服务：目标分支稳定命名为 `goal/GOAL-xxx`，任务分支稳定命名为 `task/TASK-xxx`，Worktree 位于中央运行目录按项目、目标和任务确定的路径。
- 目标分支可幂等创建；任务 Worktree 可创建、查询并在新的服务实例中从 Git Worktree 状态恢复；任务分支和确定性路径冲突时拒绝占用。
- 项目级写入队列保证并发创建同一任务只产生一个 Worktree；保留操作不删除，脏 Worktree 拒绝清理，干净 Worktree 使用非 force 的 `git worktree remove` 安全清理并保留任务分支。
- 清理目标经过中央运行目录和确定性项目/目标/任务路径校验，不执行 Commit、Merge、force 或远程操作。
- 专项测试 2/2 通过；完整 `npm run verify` 通过：64 个单元测试、62 个集成测试、14 个 Chromium Playwright 测试，以及格式、Lint、类型检查和构建。

## 交接

- [REPORT-034](../reports/REPORT-034.md) 独立验收已通过，报告状态为 `accepted`。
- TASK-033 已按依赖解锁为 `ready`；TASK-034 尚未执行，规范提交和 Merge 仍留给后续任务。
