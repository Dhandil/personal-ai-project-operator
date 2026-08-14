---
schema_version: 1
document_type: report
id: REPORT-036
title: TASK-034 规范提交、目标分支合并和主分支审批门验证报告
status: draft
report_type: task_verification
acceptance_state: pending_independent_acceptance
task_id: TASK-034
goal_id: GOAL-007
revision: 1
created_at: 2026-08-14T15:03:33Z
updated_at: 2026-08-14T15:03:33Z
verification_commands:
  - npx tsx --test apps/server/test/git-delivery.integration.test.ts
  - npm run test:integration --workspace apps/server
  - npm run verify
---
# REPORT-036：TASK-034 规范提交、目标分支合并和主分支审批门验证报告

## 结论

TASK-034 已实现，等待独立验收。实现覆盖规范 Commit、已验收任务的 task→goal 交付和用户审批保护的 goal→main 合并；不执行 TASK-035 或其他后续任务。

## 实现范围

- `git-commit-message.ts` 生成统一标题和 `Tasks: TASK-034` 正文，并拒绝非法 type/scope、空描述和非法任务 ID。
- `GitTaskDeliveryService` 要求任务状态为 `completed` 且带独立验收标记；先校验允许/禁止路径，再在 `task/TASK-xxx` 提交，最后以非 force 本地合并进入 `goal/GOAL-xxx`。
- `FileApprovalGateAdapter` 读取正式审批记录，检查 `main_merge` 操作、目标 ID、用户批准状态、subject revision/hash 快照和过期状态。
- `GitGoalMergeService` 没有有效用户审批时拒绝写入；获批后切换到 `main`，使用非 force、无远程操作的 `--no-ff` 本地合并，并返回合并提交哈希。

## 验证证据

- TASK-034 专项集成测试：4/4 通过，覆盖 Commit 格式、未验收拒绝、task→goal 合并、无审批拒绝及有效审批 goal→main 合并。
- 完整集成测试：69/69 通过。
- 完整 `npm run verify`：64 个单元测试、69 个集成测试、14 个 Chromium Playwright 测试，以及格式、Lint、类型检查和构建全部通过。
- 所有 Git 测试均使用临时仓库和临时目录，未操作真实项目的分支、Worktree 或远程。

## 边界确认

- 未执行 force、历史重写或远程 push。
- 未执行 TASK-035 或其他后续任务。
