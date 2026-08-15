---
schema_version: 1
id: TASK-045
title: 实现执行控制台进度摘要和恢复决策界面
status: in_review
goal_id: GOAL-009
role: executor
dependencies: [TASK-028, TASK-040, TASK-044]
revision: 3
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-15T07:10:00Z
approval_id: APPROVAL-004
target_branch: goal/GOAL-009
unblocked_by: TASK-044
verification_report_id: REPORT-048
---

# TASK-045：实现执行控制台、进度摘要和恢复决策界面

## 目的与范围

展示活动执行链、实时事件、周期摘要、成果、风险、异常及中断后的用户选择。

## 验收条件

- 关闭并重新打开浏览器仍能看到活动执行；
- 用户能区分等待、阻塞、失败、待决策和待恢复；
- 恢复、重试或取消均先展示影响并记录决定。

## 验证

执行控制台 Playwright 场景，覆盖 SSE 重连和后端重启模拟。

## 预计文件

执行控制台页面、事件时间线、摘要组件、恢复对话框、E2E 测试。

## 边界与交接

界面不得把“未报告”显示为“已完成”。完成后交给 TASK-046、047。

## 解锁记录

- GOAL-009 已获 APPROVAL-004 批准。
- TASK-028、TASK-040 和 TASK-044 依赖均已完成独立验收。
- TASK-045 已进入 `in_review`，实现已提交，等待 REPORT-048 独立验收。

## Completion evidence

- Added `ExecutionConsolePage` at `/projects/execution`, showing the persisted execution state, current task/goal/role, start and end times, result summary, report-backed progress timeline, and an explicit connection state.
- Recovery context is rendered before its controls. Resume, retry, and cancel each show their impact, call the existing execution action API with the persisted `executionId`, and surface the recorded decision without treating an unreported execution as completed.
- The console reloads execution state and reports from the project facts/API after browser reload. Its SSE subscription tracks the last event id, deduplicates report ids, and reconnects after a stream error.
- Added route, contract, and action-request unit coverage plus a Chromium scenario covering a failed first SSE connection, successful reconnect and live event, persisted interruption context, recovery decision, and post-decision reload.
- TASK-045 specialized tests: 13/13 unit assertions and 1/1 Chromium scenario passed. Full `npm run verify`: 70 unit tests, 113 integration tests, 15 Playwright tests, formatting, lint, typecheck, and all builds passed.
- Implementation commits: `c5dab94` (`feat(execution): 实现执行控制台与恢复决策界面`, `Tasks: TASK-045`) and `5aca0e9` (`test(execution): 覆盖控制台 SSE 重连`, `Tasks: TASK-045`).

## Handoff

- TASK-045 is `in_review` and awaits independent acceptance of REPORT-048.
- TASK-046, TASK-047, GOAL-010, and all other later work were not executed or modified.
