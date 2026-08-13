---
schema_version: 1
id: TASK-023
title: 实现短期目标和目标启动审批
status: draft
goal_id: GOAL-005
role: executor
dependencies: [TASK-007, TASK-009, TASK-020]
revision: 1
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T12:29:07Z
---

# TASK-023：实现短期目标和目标启动审批

## 目的与范围

创建、修改、拒绝和批准带范围、风险、验收及任务草案的短期目标。

## 验收条件

- 用户能审核 Agent 建议并修改后批准；
- 未批准目标不能进入可执行状态；
- 批准记录固定当时边界和验收条件。

## 验证

目标 API 集成测试和审批页面 Playwright 场景。

## 预计文件

目标应用服务、审批 Route、目标页面、目标表单、E2E 测试。

## 边界与交接

不得自动开启新目标。完成后交给 TASK-025、036。
