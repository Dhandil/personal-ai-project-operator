---
schema_version: 1
id: TASK-014
title: 实现外部修改检测和冲突处理入口
status: completed
goal_id: GOAL-003
role: executor
dependencies: [TASK-011, TASK-012, TASK-013]
revision: 3
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T04:42:45Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-013
---

# TASK-014：实现外部修改检测和冲突处理入口

## 目的与范围

监视正式治理文件的外部变化，区分可自动重载与需要用户处理的并发冲突。

## 验收条件

- 外部修改可被检测并重新校验；
- 与待写版本冲突时停止写入并返回选择项；
- 用户决定及结果进入审计记录。

## 验证

`npm run test:integration -- external-conflict`。

## 预计文件

文件监视 Adapter、冲突协调服务、冲突契约、集成测试和夹具。

## 边界与交接

禁止默认选择覆盖本地或外部版本。完成后交给 TASK-029。

## Completion

- Status: `completed`.
- Output: added a filesystem change watcher and an external conflict coordinator around the revision/hash-guarded governance repository.
- Detection and revalidation: watched governance paths emit structured external-change events; every guarded write is revalidated by the repository before any replacement.
- Conflict safety: revision/hash conflicts stop the write and return explicit `reload_external`, `keep_local`, and `cancel` choices; no force-overwrite path is provided.
- Resolution audit: user decisions and outcomes are recorded as recovery audit events with the conflict execution ID and related object IDs.
- Persistence: successful writes continue to use the existing atomic writer and project-level serialized queue.

## Verification evidence

- `npm run test:integration -- external-conflict`: 17 integration tests passed, including 3 external-conflict tests.
- `npm run verify`: format check, lint, all workspace type checks, 40 unit tests, 17 integration tests, 1 Playwright Chromium test, and all workspace builds passed.
- `git diff --check`: passed.

## Handoff

- TASK-029 and later tasks were not implemented in this task.
