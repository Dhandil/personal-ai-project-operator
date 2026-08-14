---
schema_version: 1
id: TASK-023
title: 实现短期目标和目标启动审批
status: completed
goal_id: GOAL-005
role: executor
dependencies: [TASK-007, TASK-009, TASK-020]
revision: 4
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T10:42:10Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-020
verification_report_id: REPORT-024
---

# TASK-023：实现短期目标和目标启动审批

## 目的与范围

创建、修改、拒绝和批准带范围、风险、验收条件及任务草案的短期目标。

## 验收条件

- 用户能审阅 Agent 建议并修改后批准。
- 未批准目标不能进入可执行状态。
- 批准记录固定当时的边界和验收条件。

## 验证

目标 API 集成测试和审批页面 Playwright 场景。

## 预期文件

目标应用服务、审批 Route、目标页面、目标表单、E2E 测试。

## 边界与交接

不得自动开启新目标。完成后交给 TASK-025～036。

## Completion evidence

- Added a goal application service and API routes for listing, proposing, and deciding short-term goals from registered project facts.
- Agent proposals are read-only drafts. The approval request accepts the user's edited title, boundary, risks, acceptance criteria, and task drafts as one fixed decision payload.
- Approved goals persist `status: ready` with a user approval record and never enter `in_progress` automatically. Rejected goals persist as `cancelled` and cannot become executable.
- Goal files use atomic governance writes with revision/hash conflict protection; the central registry is used only to resolve the project root.
- Added the goal approval page and Playwright scenario verifying proposal, user editing, and approval remain separate actions.
- Verification: full `npm run verify` passed with 55 unit tests, 40 integration tests, 5 Playwright Chromium tests, all workspace type checks, lint, format check, and builds.
