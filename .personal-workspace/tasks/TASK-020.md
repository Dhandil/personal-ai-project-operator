---
schema_version: 1
id: TASK-020
title: 实现项目登记列表选择和每日启动
status: draft
goal_id: GOAL-005
role: executor
dependencies: [TASK-013, TASK-015, TASK-018]
revision: 1
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T12:29:07Z
---

# TASK-020：实现项目登记、列表、选择和每日启动

## 目的与范围

提供登记项目的列表、单一当前选择和由用户主动触发的每日启动用例。

## 验收条件

- 列表来自中央索引但状态来自项目事实；
- 系统不自动决定或启动项目；
- 启动返回当前状态及是否需要恢复或用户处理。

## 验证

`npm run test:integration -- project-startup`。

## 预计文件

项目查询服务、启动用例、项目 API Route、启动契约、集成测试。

## 边界与交接

不得复制动态状态到中央数据库。完成后交给 TASK-021～028。
