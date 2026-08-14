---
schema_version: 1
id: TASK-040
title: 实现续接取消中断标记和恢复报告
status: completed
goal_id: GOAL-008
role: executor
dependencies: [TASK-036, TASK-039]
revision: 6
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T19:10:15Z
approval_id: APPROVAL-003
target_branch: goal/GOAL-008
unblocked_by: TASK-039
verification_report_id: REPORT-042
---

## TASK-040 fix verification

- Fixed cross-runtime resume: `AgentResumeRequest` now carries the exact persisted `sessionId` and a `startRequest` reconstructed from formal task facts.
- `CodexCliAdapter.resume` no longer requires an in-memory `executions` entry; a new Runtime instance creates the local process record and runs `codex exec resume <SESSION_ID>`.
- `ExecutionCoordinatorService.resume` rebuilds working directory, role, prompt, allowed paths, forbidden paths, and context from the selected task snapshot.
- Regression coverage includes a new Runtime and a new Coordinator using persisted recovery state; TASK-041 and GOAL-009 were not executed.
- Implementation commit: `4959885` (`fix(execution): 支持跨 Runtime 持久化续接`, `Tasks: TASK-040`).

# TASK-040：实现续接、取消、中断标记和恢复报告

## 目的与范围

保存需要续接的精确会话 ID，处理取消、后端关闭和重启协调，并生成用户恢复选择。

## 验收条件

- 只用精确 session UUID 续接，不使用 `--last`；
- 后端退出时尝试终止子进程并标记 `interrupted`；
- 重启后阻止下一任务，直到用户选择续接、重试或取消。

## 验证

`npm run test:integration -- execution-recovery`，模拟进程和应用重启。

## 预计文件

会话 Repository、进程生命周期协调器、恢复服务、恢复 Route、集成测试。

## 边界与交接

不得自动猜测恢复选择。完成后交给 TASK-041、045。

## 完成证据

- Agent Runtime 契约新增精确 `sessionId`；Codex Adapter 保存 thread/session ID，并使用 `codex exec resume <SESSION_ID>`，不使用 `--last`。
- Codex 进程桥支持 `kill`；取消和 Fastify `onClose` 生命周期会尝试终止子进程，退出结果映射为 `interrupted`。
- 新增项目级原子恢复记录 `.personal-workspace/executions/recovery.json`，保存执行、任务、目标、session ID、时间和恢复原因，不保存 Codex 内部会话文件。
- 重启协调会将遗留 `in_progress` 任务标记为 `paused`；恢复报告提供 `resume`、`retry`、`cancel` 三个用户选择，并在处理前阻断下一任务。
- 新增 `/api/projects/execution/retry`；恢复后的 `resume` 保持原 EXEC ID，retry 创建新的执行链，cancel 取消暂停任务并移除恢复记录。
- TASK-040 专项测试 12/12 通过，覆盖精确 session 续接、禁止 `--last`、子进程取消、重启恢复报告、阻断下一任务和续接。
- 完整 `npm run verify` 通过：66 个单元测试、91 个集成测试、14 个 Chromium Playwright 测试，以及格式、Lint、类型检查和构建。
- 实现提交：`d21088d`（`feat(execution): 实现中断恢复与会话续接`）。

## 交接

- 验证报告为 `REPORT-042`，修复复核通过，TASK-040 状态更新为 `completed`。
- 本次未执行 TASK-041 或 GOAL-009；Codex 官方会话删除清理继续留给 TASK-041。
- 新 Runtime/新 Coordinator 已使用持久化 `executionId`、精确 `sessionId` 和任务事实重建 `exec resume`；TASK-041 依赖已满足并解锁为 `ready`。
