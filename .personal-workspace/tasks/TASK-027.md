---
schema_version: 1
id: TASK-027
title: 实现审批记录和目标验收
status: completed
goal_id: GOAL-005
role: executor
dependencies: [TASK-008, TASK-009, TASK-020, TASK-023]
revision: 4
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T12:05:00Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-023
verification_report_id: REPORT-029
---

# TASK-027：实现审批记录和目标验收

## 目的与范围

统一五类审批记录、证据快照、批准/拒绝/修改结果和目标验收入口。

## 验收条件

- 审批记录引用当时对象 revision 与内容哈希；
- 过期审批不能授权已变化内容；
- 目标验收和 `main` 合并批准保持独立可审计步骤。

## 验证

`npm run test:integration -- approvals` 和审批历史 UI 检查。

## 预计文件

审批服务、审批 Route、审批页面、证据摘要组件、测试。

## 边界与交接

不实现自定义审批门。完成后交给 TASK-034。

## 完成证据

- Implemented `ApprovalService` with fixed five approval types, independent `goal_acceptance` and `main_merge` operations, Markdown persistence, atomic writes, audit events, and revision/hash subject snapshots.
- Decision execution re-reads the subject and returns `expired_approval` when the recorded revision or hash no longer matches; stale approvals never authorize changed content.
- Added approval API routes and approval history UI with evidence snapshot display.
- Verification: `npm run test:integration --workspace apps/server -- --test-name-pattern='approval|recovery|history'` passed; full `npm run verify` passed with 63 unit tests, 52 integration tests, 9 Playwright tests, quality checks, and builds.

## 交接

- Handoff to TASK-034: consume approval records through `/api/projects/approvals` and `/api/projects/approvals/decision`; treat `expired_approval` as a mandatory reload/review path.
- No custom approval gates were added. TASK-029 was implemented in the same governed change set as explicitly requested; no other task was advanced.
