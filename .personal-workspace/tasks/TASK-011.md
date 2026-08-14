---
schema_version: 1
id: TASK-011
title: 实现原子写入 revision 哈希和项目写入队列
status: completed
goal_id: GOAL-003
role: executor
dependencies: [TASK-010]
revision: 4
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T03:08:09Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-010
verification_report_id: REPORT-012
---

# TASK-011：实现原子写入、revision、哈希和项目写入队列

## 目的与范围

建立按项目串行化的治理文件 Repository，并使用临时替换、revision 和内容哈希保护写入。

## 验收条件

- 写入失败不会损坏正式文件；
- 并发请求按项目有序执行；
- revision 或哈希不匹配时拒绝覆盖。

## 验证

`npm run test:integration -- governance-repository`。

## 预计文件

治理 Repository、原子文件写入器、写入队列、哈希工具、集成测试。

## 边界与交接

不得静默解决冲突或写中央数据库代替项目文件。完成后解锁 TASK-012～014。

## Completion

- Status: `completed`.
- Output: added SHA-256 hashing, atomic file replacement, per-project serialized write queues, and a governance repository with revision/hash compare-and-write checks.
- Atomicity: writes use a unique temporary file, flush/sync, rename, and cleanup on failure; rejected writes leave the formal file unchanged.
- Conflict safety: revision or content-hash mismatches return structured errors and never overwrite external changes.
- Concurrency: writes sharing a project root execute in queue order; concurrent stale writers cannot both overwrite the same revision.
- Boundary: no silent conflict resolution and no central database replacement was added.

## Verification evidence

- `npm run test:integration -- governance-repository`: 6 tests passed.
- `npm run verify`: format check, lint, all workspace type checks, 40 unit tests, 6 integration tests, 1 Playwright Chromium test, and all workspace builds passed.
- `git diff --check`: passed.

## Handoff

- TASK-012, TASK-013, and TASK-014 were not implemented in this task.
