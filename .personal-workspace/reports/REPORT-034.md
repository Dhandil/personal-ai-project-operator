---
schema_version: 1
document_type: report
id: REPORT-034
title: TASK-032 目标分支、任务分支和 Worktree 生命周期验证报告
status: accepted
report_type: task_verification
acceptance_state: accepted
task_id: TASK-032
goal_id: GOAL-007
revision: 2
created_at: 2026-08-14T13:56:49Z
updated_at: 2026-08-14T14:05:08Z
verified_commit: dec4a69
accepted_by: project_lead
accepted_at: 2026-08-14T14:05:08Z
verification_commands:
  - npx tsx --test apps/server/test/git-worktree.integration.test.ts
  - npm run test:integration --workspace apps/server
  - npm run verify
---
# REPORT-034：TASK-032 目标分支、任务分支和 Worktree 生命周期验证报告

## 结论

独立验收通过。TASK-032 已满足目标分支、任务分支、Worktree 路径和生命周期的任务边界，不执行 Commit、Merge 或差异边界校验。

## 实现范围

- 目标分支稳定命名为 `goal/GOAL-xxx`；任务分支稳定命名为 `task/TASK-xxx`。
- Worktree 路径由项目根目录哈希、目标 ID 和任务 ID 确定，位于中央运行目录的 `runtime/worktrees/` 下。
- 目标分支支持幂等创建；任务 Worktree 支持创建、查询、保留和安全清理。
- Git Worktree 状态是可恢复来源；新的服务实例可以查询已有 Worktree，不依赖进程内状态。
- 项目级写入队列保证同一任务的并发创建不会占用两个 Worktree。
- 清理前验证确定性绝对路径；脏 Worktree 拒绝清理，干净 Worktree 使用非 force 的 `git worktree remove`，任务分支保留。

## 验证证据

- TASK-032 专项集成测试：2/2 通过。
- 完整 `npm run verify`：64 个单元测试、62 个集成测试、14 个 Chromium Playwright 测试，以及格式、Lint、类型检查和构建全部通过。
- 所有 Git 操作测试均使用临时仓库和临时运行目录，未操作真实项目仓库的分支或 Worktree。

## 边界确认

- 未实现 TASK-033 的差异、允许路径和禁止动作校验。
- 未实现 TASK-034 的规范提交、目标分支合并或 `main` 审批门。
- 未执行 force、历史重写、远程操作、Commit 或 Merge。

## 独立验收

已复核分支命名、确定性路径、服务重启后的查询恢复、并发占用保护、保留行为、脏 Worktree 拒绝清理及干净 Worktree 安全清理。专项测试和完整验证全部通过，因此本报告状态更新为 `accepted`。

TASK-033 的依赖已满足并解锁；TASK-034 仍需等待 TASK-033。GOAL-008 及其任务不受本次验收影响。
