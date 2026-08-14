---
schema_version: 1
id: TASK-012
title: 实现追加式审计事件记录
status: completed
goal_id: GOAL-003
role: executor
dependencies: [TASK-011]
revision: 3
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T03:43:23Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-011
---

# TASK-012：实现追加式审计事件记录

## 目的与范围

实现 `audit/events.jsonl` 追加写入、事件 Schema 和按项目读取能力。

## 验收条件

- 事件只能追加且每行独立可解析；
- 失败、越权、恢复和正式状态变化可关联对象与执行；
- 尾部损坏能被识别并报告。

## 验证

`npm run test:integration -- audit-log`。

## 预计文件

审计事件契约、审计 Repository、JSONL 编解码、集成测试和测试夹具。

## 边界与交接

禁止修改既有事件。完成后交给 TASK-013 和后续报告功能。

## Completion

- Status: `completed`.
- Output: added the audit event contract, JSONL codec, and project-scoped append-only audit repository at `audit/events.jsonl`.
- Append-only safety: each event is encoded as one independently parseable JSON line; duplicate IDs are rejected and existing lines are never rewritten.
- Traceability: failure, privilege violation, recovery, and formal status-change events retain related object IDs and execution IDs; status changes retain from/to status and reason.
- Corruption handling: invalid UTF-8, empty lines, invalid JSON, invalid event schemas, and malformed tails return structured errors; appends are refused when the existing log is corrupt.
- Concurrency: appends share the existing project-level serialized write queue.

## Verification evidence

- `npm run test:integration -- audit-log`: 10 integration tests passed, including 4 audit-log tests.
- `npm run verify`: format check, lint, all workspace type checks, 40 unit tests, 10 integration tests, 1 Playwright Chromium test, and all workspace builds passed.
- `git diff --check`: passed.

## Handoff

- TASK-013 and TASK-014 were not implemented in this task.
