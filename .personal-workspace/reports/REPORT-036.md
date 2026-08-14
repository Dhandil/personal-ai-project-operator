---
schema_version: 1
document_type: report
id: REPORT-036
title: TASK-034 规范提交、目标分支合并和主分支审批门验证报告
status: accepted
report_type: task_verification
acceptance_state: accepted
task_id: TASK-034
goal_id: GOAL-007
revision: 4
created_at: 2026-08-14T15:03:33Z
updated_at: 2026-08-14T15:30:06Z
verified_commit: 9790833
accepted_by: project_lead
accepted_at: 2026-08-14T15:30:06Z
verification_commands:
  - npx tsx --test apps/server/test/git-delivery.integration.test.ts
  - npm run test:integration --workspace apps/server
  - npm run verify
---
# REPORT-036：TASK-034 规范提交、目标分支合并和主分支审批门验证报告

## 结论

独立复核通过。硬编码任务关联问题已修复，TASK-034 满足规范 Commit、已验收任务的 task→goal 交付和用户审批保护的 goal→main 合并边界；不执行 TASK-035 或其他后续任务。

## 实现范围

- `git-commit-message.ts` 生成统一标题和实际任务 ID 的 `Tasks: TASK-xxx` 正文，并拒绝非法 type/scope、空描述和非法任务 ID。
- `GitTaskDeliveryService` 要求任务状态为 `completed` 且带独立验收标记；先校验允许/禁止路径，再在 `task/TASK-xxx` 提交，最后以非 force 本地合并进入 `goal/GOAL-xxx`，合并正文引用请求中的实际 task ID。
- `FileApprovalGateAdapter` 读取正式审批记录，检查 `main_merge` 操作、目标 ID、用户批准状态、subject revision/hash 快照和过期状态。
- `GitGoalMergeService` 要求目标合并请求携带实际 task ID；没有有效用户审批时拒绝写入，获批后切换到 `main`，使用非 force、无远程操作的 `--no-ff` 本地合并，并返回合并提交哈希。

## 验证证据

- TASK-034 修复专项集成测试：4/4 通过，覆盖 Commit 格式、未验收拒绝，以及非 TASK-034 的动态 task→goal 和 goal→main 关联。
- 完整集成测试：69/69 通过。
- 完整 `npm run verify`：64 个单元测试、69 个集成测试、14 个 Chromium Playwright 测试，以及格式、Lint、类型检查和构建全部通过。
- 所有 Git 测试均使用临时仓库和临时目录，未操作真实项目的分支、Worktree 或远程。

## 边界确认

- 未执行 force、历史重写或远程 push。
- 未执行 TASK-035 或其他后续任务。

## 独立复核结果

- 专项测试 4/4、完整集成测试 69/69、单元测试 64/64、Chromium Playwright 14/14，以及格式、Lint、类型检查和构建全部通过。
- 初次复核发现的硬编码问题已修复：合并正文现在根据实际请求的 `taskId` 动态生成。
- 修复回归覆盖 `TASK-099/GOAL-099` 的 task→goal 和 goal→main 关联，确认生成 `Tasks: TASK-099`。
- 修复后的专项测试和完整验证全部通过，因此本报告状态更新为 `accepted`。

## 修复复核

- 原因：task→goal 与 goal→main 的合并正文曾硬编码 `Tasks: TASK-034`。
- 修复：task→goal 使用 `TaskDeliveryRequest.taskId`，goal→main 要求 `GoalMergeRequest.taskId` 并使用该值生成正文。
- 回归：临时 `TASK-099/GOAL-099` 两类合并均生成 `Tasks: TASK-099`，未生成 `Tasks: TASK-034`。
