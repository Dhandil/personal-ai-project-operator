---
schema_version: 1
id: TASK-025
title: 实现任务卡依赖及轻量自定义字段
status: draft
goal_id: GOAL-005
role: executor
dependencies: [TASK-007, TASK-020, TASK-023]
revision: 1
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T12:29:07Z
---

# TASK-025：实现任务卡、依赖及轻量自定义字段

## 目的与范围

提供正式任务卡的创建、编辑、依赖检查、角色分配和简单自定义字段。

## 验收条件

- 必填、权限、验证和交接字段完整；
- 循环依赖和缺失依赖被拒绝；
- 可选字段可隐藏，未知 YAML 字段往返保留。

## 验证

任务 API 集成测试和任务编辑 Playwright 场景。

## 预计文件

任务应用服务、API Route、任务页面、任务表单、E2E 测试。

## 边界与交接

不实现复杂表单设计器。完成后交给 TASK-036、037。
