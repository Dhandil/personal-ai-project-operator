---
schema_version: 1
id: TASK-024
title: 实现角色模板和上下文读取规则
status: ready
goal_id: GOAL-005
role: executor
dependencies: [TASK-007, TASK-020]
revision: 2
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T07:37:05Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-020
---

# TASK-024：实现角色模板和上下文读取规则

## 目的与范围

提供五类可编辑角色模板，并维护职责、必读、按需读、允许、禁止和交接要求。

## 验收条件

- 角色不包含具体 Agent 或会话标识；
- 必读与按需读文件可校验存在性；
- 审核者默认禁止修改正式项目文件。

## 验证

角色 API 集成测试和角色编辑页面手工/组件检查。

## 预计文件

角色应用服务、API Route、角色页面、角色表单、测试。

## 边界与交接

不为每个角色创建长期 Agent。完成后交给 TASK-037。
