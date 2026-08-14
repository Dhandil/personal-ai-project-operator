---
schema_version: 1
id: TASK-030
title: 完成 V0 浏览器端到端测试
status: completed
goal_id: GOAL-006
role: reviewer
dependencies: [TASK-019, TASK-020, TASK-021, TASK-022, TASK-023, TASK-024, TASK-025, TASK-026, TASK-027, TASK-028, TASK-029]
revision: 3
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T12:05:52Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-029
---

# TASK-030：完成 V0 浏览器端到端测试

## 目的与范围

以独立审核视角覆盖 V0 新项目初始化和治理主路径，不修改业务实现以迁就测试。

## 验收条件

- 临时项目覆盖创建、启动、阶段、目标、角色、任务、问题、审批和恢复；
- 未批准、冲突和非法状态路径得到验证；
- Chromium 场景稳定重复通过。

## 验证

`npm run verify`。

## 预计文件

V0 E2E 夹具、初始化场景、治理场景、恢复场景和测试辅助文件。

## 边界与交接

不得对真实项目运行测试；发现缺陷只出报告并创建修改任务。完成后交给 TASK-031。

## 完成证据

- Added `e2e/v0-governance.spec.ts` with temporary-directory fixtures and browser coverage for project creation, daily startup, workflow stages, goals, roles, tasks, issues, approvals, history, and reports.
- Added explicit negative-path coverage for approval-required execution failure, initialization conflicts that disable approval, recovery-required startup, and invalid workflow facts.
- Tests do not access real project directories, do not modify business implementation, and clean every temporary fixture in `finally` blocks.
- Verification: full `npm run verify` passed with 63 unit tests, 52 integration tests, 14 Chromium Playwright tests, formatting, lint, type checks, and builds.

## 交接

- Handoff to TASK-031: use the V0 browser fixture and extend only with newly unlocked acceptance paths; preserve temporary-project isolation and Chromium-only execution.
- No business defect was found and no task outside TASK-030 was modified.
