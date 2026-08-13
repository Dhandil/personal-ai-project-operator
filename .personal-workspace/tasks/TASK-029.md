---
schema_version: 1
id: TASK-029
title: 实现重启恢复索引重建和历史查看
status: draft
goal_id: GOAL-006
role: executor
dependencies: [TASK-013, TASK-014, TASK-015, TASK-020]
revision: 1
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T12:29:07Z
---

# TASK-029：实现重启恢复、索引重建和历史查看

## 目的与范围

从项目文件恢复状态，重建中央索引，并展示冲突、审计和正式记录历史。

## 验收条件

- 删除数据库和 `status.md` 后可恢复；
- 重启不会丢失待处理冲突或用户决策；
- 历史视图区分事实、生成快照和审计事件。

## 验证

恢复集成测试和重启/历史 Playwright 场景。

## 预计文件

恢复服务、索引重建 Route、历史 Route、历史页面、E2E 测试。

## 边界与交接

不得从聊天历史重建项目事实。完成后交给 TASK-030。
