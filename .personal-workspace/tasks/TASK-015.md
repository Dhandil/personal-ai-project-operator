---
schema_version: 1
id: TASK-015
title: 实现 SQLite 项目索引和迁移
status: completed
goal_id: GOAL-003
role: executor
dependencies: [TASK-004]
revision: 3
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T05:47:04Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-014
---

# TASK-015：实现 SQLite 项目索引和迁移

## 目的与范围

在 `%LOCALAPPDATA%\PersonalAIProjectOperator\app.db` 建立项目索引、设置和可重建缓存的直接 SQL 迁移。

## 验收条件

- 首次启动自动创建并迁移；
- 数据库不保存任务、进度、决策等动态事实；
- 删除数据库后可从登记目录重建项目索引。

## 验证

`npm run db:migrate`；`npm run test:integration -- registry-db`。

## 预计文件

SQLite 连接、迁移执行器、首个 SQL 迁移、项目索引 Repository、集成测试。

## 边界与交接

不引入 ORM。完成后提交 GOAL-003 检查点并解锁 TASK-017、020。

## Completion

- Status: `completed`.
- Output: added a direct-SQL SQLite migration, database wrapper, project registry repository, settings/cache storage, and `npm run db:migrate`.
- Storage boundary: the database contains only `projects`, `settings`, `project_cache`, and `schema_migrations`; dynamic task, progress, decision, and other project facts remain in project files.
- Rebuildability: registration markers in the separate registry directory are the source for rebuilding the project index after deleting `app.db`.
- Startup safety: database construction runs the idempotent migration automatically; explicit migration is also available through the required command.
- Scope: no ORM or new runtime dependency was introduced; SQLite uses Node 24's built-in `node:sqlite` API.

## Verification evidence

- `npm run db:migrate`: SQLite migration completed successfully.
- `npm run test:integration -- registry-db`: 20 integration tests passed, including 3 registry-db tests.
- `npm run verify`: format check, lint, all workspace type checks, 40 unit tests, 20 integration tests, 1 Playwright Chromium test, and all workspace builds passed.
- `git diff --check`: passed.

## Handoff

- TASK-016 was not implemented in this task; TASK-017 remains blocked until TASK-016 is accepted.
