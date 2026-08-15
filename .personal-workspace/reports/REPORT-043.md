---
schema_version: 1
document_type: report
id: REPORT-043
title: TASK-041 临时会话和官方删除清理验证报告
status: changes_requested
report_type: task_verification
acceptance_state: changes_requested
task_id: TASK-041
goal_id: GOAL-008
revision: 2
created_at: 2026-08-14T19:31:21Z
updated_at: 2026-08-15T03:42:46Z
verified_by: implementation_agent
verified_commit: fafd1fd
verification_commands:
  - npx tsx --test apps/server/test/codex-cli-adapter.integration.test.ts apps/server/test/execution-coordinator.integration.test.ts apps/server/test/fake-agent.integration.test.ts
  - npm run verify
---

# REPORT-043：TASK-041 临时会话和官方删除清理验证报告

## 结论

TASK-041 已完成实现并提交，当前进入独立用户验收。实现覆盖临时会话策略、保存会话的官方删除、应用运行目录安全清理、清理失败重试和 Coordinator 生命周期接入；未执行或修改 GOAL-009。

## 实现证据

- `AgentStartRequest.sessionPolicy` 支持 `persistent` 和 `ephemeral`；一次性会话生成 `codex exec --ephemeral`，不会保存 rollout，也不会调用 `codex delete`。
- 保存会话在终止后只通过参数数组执行 `codex delete <SESSION_ID> --force`，不使用 shell 拼接，不使用 `--last`，不读取或删除 Codex 内部会话文件。
- `CodexCliAdapter.cleanup` 仅允许终态执行；官方删除失败返回 `cleanup_failed`、`retryable: true` 并保留执行记录，重试可再次删除。
- 应用运行目录由 `RuntimeDirectoryCleaner` 负责；清理前验证绝对路径位于配置的应用运行根目录内，根目录本身和外部路径均拒绝，成功结果提供 `estimatedFreedBytes`。
- Coordinator 在正常终止和用户取消后调用清理；自然中断不提前删除保存会话，保留 TASK-040 的 resume 恢复路径。

## 验证结果

- TASK-041 专项测试：22/22 通过，覆盖 `--ephemeral`、官方删除参数、成功清理、删除失败、失败重试、释放量估算和路径保护。
- 完整 `npm run verify`：66 个单元测试、97 个集成测试、14 个 Chromium Playwright 测试，以及格式、Lint、类型检查和构建全部通过。
- 实现提交：`fafd1fd`（`feat(agent-runtime): 实现临时会话和官方清理`，正文包含 `Tasks: TASK-041`）。

## 范围确认

- 未读取、解析、编辑或删除 Codex 内部会话文件。
- 未对真实个人项目执行测试；测试使用 Fake Process 和临时目录。
- 未执行或修改 GOAL-009，也未执行 TASK-042 及其他后续任务。

## 独立复核结果

- 专项测试 22/22 通过，覆盖 ephemeral、persistent 删除、清理失败重试、释放量估算和路径保护；完整 `npm run verify` 通过：66 个单元测试、97 个集成测试、14 个 Chromium Playwright 测试，以及格式、Lint、类型检查和构建。
- 发现 persistent 会话缺失 session ID 时的清理边界：`CodexCliAdapter.cleanup` 当前仅在 `sessionId !== null` 时执行官方删除；若终态前没有 `thread.started`，会跳过 `codex delete <UUID> --force`，随后仍可能清理运行目录并删除执行记录。
- 该路径可能遗留 Codex 保存会话，不满足“保存会话只用精确 UUID 删除”的验收要求。

## 修复要求

persistent 会话没有精确 session ID 时必须返回 `cleanup_failed`、`retryable: true`，保留执行记录并阻止运行目录清理；补充无 thread ID 回归测试后重新运行专项和完整验证。TASK-041 当前为 `changes_requested`，GOAL-009 不启动。

## 用户验收建议

1. 核对一次性会话命令包含 `--ephemeral`，且清理不会调用 `codex delete`。
2. 核对保存会话只生成 `codex delete <SESSION_ID> --force`，并检查失败后可重试、执行记录未丢失。
3. 核对运行目录外部路径和运行根目录本身均被拒绝，成功清理返回估算释放字节数。
4. 验收通过后将 `REPORT-043` 标记为 `accepted`、将 `TASK-041` 更新为 `completed`；不要启动 GOAL-009。
