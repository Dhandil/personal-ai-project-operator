---
schema_version: 1
id: TASK-024
title: 实现角色模板和上下文读取规则
status: completed
goal_id: GOAL-005
role: executor
dependencies: [TASK-007, TASK-020]
revision: 3
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T09:05:00Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-020
---

# TASK-024：实现角色模板和上下文读取规则

## 目的与范围

提供五类可编辑角色模板，并维护职责、必读、按需读取、允许、禁止和交接要求。

## 验收条件

- 角色不包含具体 Agent 或会话标识。
- 必读与按需读取文件可校验存在性。
- 审查者默认禁止修改正式项目文件。

## 验证

角色 API 集成测试、角色编辑页面组件和 Playwright 检查。

## 预期文件

角色应用服务、API Route、角色页面、角色表单、测试。

## 边界与交接

不为每个角色创建长期 Agent。完成后交给 TASK-037。

## Completion evidence

- Added role APIs for reading the five stable templates and persisting project-specific role templates through atomic governance writes.
- Role payload validation rejects Agent, session, and session ID bindings, and requires non-empty responsibilities, context, action, and handoff fields.
- Required and on-demand context items map to project paths and report explicit `available` or `missing` state; no missing context is inferred by the UI.
- Reviewer templates retain `read repository` and `modify implementation` protections and expose `canModifyProjectFiles: false`.
- Added the roles page, editable template form, context status panels, contract tests, integration tests, and a Chromium scenario.
- Verification: full `npm run verify` passed with 57 unit tests, 42 integration tests, 6 Playwright Chromium tests, all workspace type checks, lint, format check, and builds.
