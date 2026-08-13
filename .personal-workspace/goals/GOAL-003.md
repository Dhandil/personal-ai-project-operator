---
schema_version: 1
id: GOAL-003
title: 建立文件事实层
status: draft
revision: 1
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T12:29:07Z
tasks: [TASK-010, TASK-011, TASK-012, TASK-013, TASK-014, TASK-015]
---

# GOAL-003：建立文件事实层

## 目标

建立可持久化、可恢复、可检测冲突的项目事实层，以及只保存索引和缓存的中央 SQLite 数据库。

## 验收

- 项目事实在应用关闭后仍可独立读取；
- `status.md` 和中央索引均可重建；
- 外部修改不会被静默覆盖。
