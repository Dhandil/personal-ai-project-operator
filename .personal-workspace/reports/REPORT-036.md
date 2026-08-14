---
schema_version: 1
document_type: report
id: REPORT-036
title: TASK-034 规范提交、目标分支合并和主分支审批门验证报告
status: changes_requested
report_type: task_verification
acceptance_state: changes_requested
task_id: TASK-034
goal_id: GOAL-007
revision: 2
created_at: 2026-08-14T15:03:33Z
updated_at: 2026-08-14T15:10:42Z
reviewed_by: project_lead
reviewed_at: 2026-08-14T15:10:42Z
verification_commands:
  - npx tsx --test apps/server/test/git-delivery.integration.test.ts
  - npm run test:integration --workspace apps/server
  - npm run verify
---
# REPORT-036：TASK-034 规范提交、目标分支合并和主分支审批门验证报告

## 结论

独立复核发现问题，暂不接受。实现覆盖规范 Commit、已验收任务的 task→goal 交付和用户审批保护的 goal→main 合并；不执行 TASK-035 或其他后续任务。

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

## 独立复核结果

- 专项测试 4/4、完整集成测试 69/69、单元测试 64/64、Chromium Playwright 14/14，以及格式、Lint、类型检查和构建全部通过。
- 发现阻塞问题：`GitTaskDeliveryService.deliverTask` 与 `GitGoalMergeService.mergeGoal` 的合并提交正文硬编码为 `Tasks: TASK-034`。当服务处理其他任务或目标时，提交会错误关联到 TASK-034，破坏任务交接、审计和提交追踪。
- 修复要求：提交正文必须根据实际请求动态生成，不能硬编码 TASK-034；增加至少一个非 TASK-034 的回归测试，覆盖 task→goal 和/或 goal→main 提交关联。
- 在修复并重新验证前，本报告保持 `changes_requested`，TASK-034 不得解锁后续任务。
