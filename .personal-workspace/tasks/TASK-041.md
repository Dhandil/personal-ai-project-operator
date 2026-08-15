---
schema_version: 1
id: TASK-041
title: 实现临时会话和官方删除清理
status: completed
goal_id: GOAL-008
role: executor
dependencies: [TASK-039, TASK-040]
revision: 6
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-15T03:59:42Z
approval_id: APPROVAL-003
target_branch: goal/GOAL-008
unblocked_by: TASK-040
---

## TASK-041 repair verification

- Persistent cleanup now fails with `cleanup_failed` and `retryable: true` when no precise `thread.started` session ID was captured.
- This failure returns before official deletion or application runtime-directory cleanup, and the execution record remains available for retry.
- Added a regression test with a terminal result and no `thread.started`; it verifies the runtime directory and execution remain preserved.
- TASK-041 repair tests: 23/23 specialized tests passed; full verify passed with 66 unit, 98 integration, and 14 Playwright tests.
- Repair commit: `543ef43` (`fix(agent-runtime): 阻止无会话 ID的清理`, `Tasks: TASK-041`).
- GOAL-009 was not executed or modified.

## 独立验收

- 修复复核通过：persistent 缺少精确 session ID 时返回 `cleanup_failed`、`retryable: true`，不执行删除、不清理运行目录并保留执行记录。
- 专项测试 23/23、完整验证 66 单元、98 集成、14 Playwright 及质量检查全部通过。
- REPORT-043 已接受；GOAL-008 全部任务完成，检查点报告为 REPORT-044，等待用户验收。

## TASK-041 verification evidence

- Added `sessionPolicy: ephemeral|persistent`; ephemeral starts include `codex exec --ephemeral` and never invoke official deletion.
- Persistent terminal executions invoke only `codex delete <SESSION_ID> --force`; the exact session ID is captured from the structured thread event.
- Cleanup failures return `cleanup_failed`, remain retryable, and preserve the execution record until cleanup succeeds.
- Added application-owned `RuntimeDirectoryCleaner` with absolute-path and runtime-root containment checks; it never reads or deletes Codex internal session files.
- Coordinator cleanup runs after normal terminal execution and after user cancellation; interrupted executions retain their saved session for TASK-040 recovery.
- TASK-041 specialized regression tests: 22/22 passed.
- Full `npm run verify`: 66 unit tests, 97 integration tests, 14 Playwright tests, formatting, lint, typecheck, and builds all passed.
- Implementation commit: `fafd1fd` (`feat(agent-runtime): 实现临时会话和官方清理`, `Tasks: TASK-041`).
- GOAL-009 was not executed or modified.

## 独立复核

- 专项测试 22/22、完整验证 66 单元、97 集成、14 Playwright 及质量检查均通过。
- 发现 persistent 会话若终态前没有收到 `thread.started`，`sessionId` 为 `null` 时当前 cleanup 会跳过 `codex delete` 并继续报告成功，可能遗留保存会话。
- 修复要求：persistent 会话缺失精确 session ID 时必须返回 `cleanup_failed`、`retryable: true`，保留执行记录并阻止目录清理；补充无 thread ID 回归测试后重新复核。

# TASK-041：实现临时会话和官方删除清理

## 目的与范围

按任务可恢复性选择 `--ephemeral` 或保存会话，并在完成/取消后调用官方删除命令和清理运行目录。

## 验收条件

- 一次性任务不持久化 rollout；
- 保存会话只用 `codex delete <UUID> --force` 清理；
- 清理失败记录 `cleanup_failed`、可重试并显示估算释放量。

## 验证

清理集成测试覆盖成功、失败、重试和路径保护。

## 预计文件

会话策略、Codex 删除 Adapter、运行目录清理器、清理报告契约、测试。

## 边界与交接

禁止读取或删除 Codex 内部会话文件；递归清理前验证绝对路径位于应用运行目录。完成后提交 GOAL-008 检查点。
