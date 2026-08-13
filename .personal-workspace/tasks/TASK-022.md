---
schema_version: 1
id: TASK-022
title: 实现工作流阶段和跳过建议
status: draft
goal_id: GOAL-005
role: executor
dependencies: [TASK-006, TASK-009, TASK-020]
revision: 1
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T12:29:07Z
---

# TASK-022：实现工作流、阶段和跳过建议

## 目的与范围

提供默认阶段查看、阶段产物关联、Agent 跳过建议和用户跳过决定。

## 验收条件

- 默认流程与 Spec 一致；
- 跳过建议说明材料、缺失和风险；
- 只有用户决定后状态才变为 `skipped` 并记录理由。

## 验证

工作流 API 集成测试和阶段页面 Playwright 场景。

## 预计文件

工作流应用服务、API Route、阶段页面、跳过对话框、E2E 测试。

## 边界与交接

不实现自定义工作流设计器。完成后更新状态投影。
