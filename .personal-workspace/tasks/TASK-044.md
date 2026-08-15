---
schema_version: 1
id: TASK-044
title: 实现返工同一审核者复审和自动下一任务
status: in_review
goal_id: GOAL-009
role: executor
dependencies: [TASK-036, TASK-042, TASK-043]
revision: 3
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-15T14:45:00Z
approval_id: APPROVAL-004
target_branch: goal/GOAL-009
unblocked_by: TASK-043
verification_report_id: REPORT-047
---

# TASK-044：实现返工、同一审核者复审和自动下一任务

## 目的与范围

在审核不通过时自动交回执行者，修正后由同一审核角色实例复审，并在获批目标内选择下一任务。

## 验收条件

- `changes_requested` 只能交回执行者写入；
- 复审关联原审核和修正证据；
- 只有目标边界内、依赖满足且无待决策时才自动推进。

## 验证

`npm run test:integration -- review-loop`，覆盖多轮返工和停止条件。

## 预计文件

返工协调器、复审关联策略、下一任务选择器、状态集成测试、流程夹具。

## 边界与交接

不得自动开启新目标或越过用户决策。完成后交给 TASK-045、047。

## 解锁记录

- GOAL-009 已获 APPROVAL-004 批准。
- TASK-036、TASK-042 和 TASK-043 依赖均已完成独立验收。
- TASK-044 已进入 `in_review`；实现已提交，等待 REPORT-047 独立验收。

## Completion evidence

- Added `ReviewLoopService` to return `changes_requested` reviews to the executor, preserve the original report link, and reject rework for accepted reports or non-executor tasks.
- Rework starts only from `changes_requested`, transitions through the existing execution coordinator, and produces a new execution result for review.
- Review reports now record `previousReportId`, `reviewRound`, and a stable `reviewerInstanceId`; a re-review must reference a prior `changes_requested` report for the same task and goal and receives the prior review context.
- Accepted reports reuse `completeTaskIfEligible`, so task completion still requires the approved goal, acceptance approval, actual outputs, verification evidence, Git boundary, passing tests, and no unresolved violations.
- Added `NextTaskSelectorService`, which only selects a ready task in the same approved goal after dependencies are completed and no blocking issue or pending decision applies. It never starts a new goal or crosses a user decision.
- Added the review-loop API route and integration coverage for multi-round rework, same-reviewer association, approval gating, accepted-report rejection, and eligible next-task selection.
- TASK-044 specialized tests: 3/3 passed. Full `npm run verify`: 66 unit tests, 113 integration tests, 14 Playwright tests, formatting, lint, typecheck, and all builds passed.
- Implementation report: `REPORT-047`.
- Implementation commit: `bdff9d6` (`feat(review): 实现返工复审与自动推进`, `Tasks: TASK-044`).

## Handoff

- TASK-044 is `in_review` and awaits independent acceptance of REPORT-047.
- TASK-045, TASK-047, and all other later tasks were not executed or modified.
