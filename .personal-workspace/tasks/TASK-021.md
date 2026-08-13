---
schema_version: 1
id: TASK-021
title: 实现项目总览和推荐下一步界面
status: draft
goal_id: GOAL-005
role: executor
dependencies: [TASK-020]
revision: 1
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T12:29:07Z
---

# TASK-021：实现项目总览和推荐下一步界面

## 目的与范围

展示启动简报的全部确认字段和基于当前事实的推荐下一步。

## 验收条件

- 展示目标、成果、当前任务/角色、风险、上一小步、下一步和用户操作；
- 每个摘要可追溯到正式事实；
- 缺失信息明确显示，不由 UI 猜测补全。

## 验证

组件测试、项目总览 Playwright 场景和 `npm run build`。

## 预计文件

总览页面、启动简报组件、项目查询 Client、路由配置、E2E 测试。

## 边界与交接

推荐不等于自动批准或执行。完成后作为后续治理页面入口。
