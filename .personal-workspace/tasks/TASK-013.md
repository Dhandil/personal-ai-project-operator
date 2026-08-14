---
schema_version: 1
id: TASK-013
title: 从领域事实生成唯一 status.md 快照
status: completed
goal_id: GOAL-003
role: executor
dependencies: [TASK-011, TASK-012]
revision: 3
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T04:27:59Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-012
---

# TASK-013：从领域事实生成唯一 `status.md` 快照

## 目的与范围

从目标、任务、审批、问题、决策、交接和报告生成启动简报所需的唯一当前摘要。

## 验收条件

- 删除 `status.md` 后可完全重建；
- 快照不包含无法从事实解释的状态；
- 冲突时事实文件优先，快照只重建不反向覆盖。

## 验证

`npm run test:integration -- status-projection`。

## 预计文件

状态投影服务、快照渲染器、读取端口、集成测试和夹具。

## 边界与交接

不得把快照作为可独立编辑的事实。完成后交给 TASK-014、020。

## Completion

- Status: `completed`.
- Output: added a deterministic status renderer and a project-scoped `StatusProjection` for `.personal-workspace/status.md`.
- Fact priority: the snapshot body is rendered only from project, goal, task, approval, issue, decision, handoff, and report facts; existing snapshot content is never used as a fact source.
- Rebuildability: deleting `status.md` and rebuilding with the same facts regenerates the same snapshot content and revision baseline.
- Conflict handling: edited or invalid snapshot content is replaced by a fresh projection; the generated file never writes back into domain facts.
- Persistence: snapshot writes use the existing per-project queue and atomic file replacement, and the reader reports missing or invalid snapshots structurally.

## Verification evidence

- `npm run test:integration -- status-projection`: 14 integration tests passed, including 4 status-projection tests.
- `npm run verify`: format check, lint, all workspace type checks, 40 unit tests, 14 integration tests, 1 Playwright Chromium test, and all workspace builds passed.
- `git diff --check`: passed.

## Handoff

- TASK-014 was not implemented in this task.
