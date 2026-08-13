---
schema_version: 1
id: TASK-015
title: 实现 SQLite 项目索引和迁移
status: draft
goal_id: GOAL-003
role: executor
dependencies: [TASK-004]
revision: 1
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T12:29:07Z
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
