---
schema_version: 1
document_type: report
id: REPORT-047
title: TASK-044 rework review loop and next task report
status: pending_acceptance
report_type: task_verification
acceptance_state: pending
task_id: TASK-044
goal_id: GOAL-009
revision: 1
created_at: 2026-08-15T14:45:00Z
updated_at: 2026-08-15T14:45:00Z
verified_by: implementation_agent
verified_commit: bdff9d6
verification_commands:
  - npx tsx --test apps/server/test/review-loop.integration.test.ts
  - npm run verify
---

# REPORT-047: TASK-044 rework review loop and next task

## Conclusion

TASK-044 is implemented and submitted for independent acceptance. A failed review returns the task to the executor, a new executor result is reviewed through the same reviewer instance identity, and an accepted result advances only after the existing completion policy and approved-goal gates pass.

## Implementation evidence

- `ReviewLoopService` handles the review outcome. `changes_requested` transitions the task from `in_review` to `changes_requested` with reviewer audit context; `blocked` stops the task; accepted reviews enter the existing completion policy.
- Rework is explicit and bounded: it requires a `changes_requested` report for the same task, the task must remain assigned to `executor`, and the execution coordinator accepts only the `rework` path for this status.
- `review_report` now stores `previousReportId`, `reviewRound`, and `reviewerInstanceId`. `ReviewService` rejects mismatched, accepted, missing, or same-execution predecessor reports and passes the predecessor evidence into the read-only reviewer context.
- Accepted completion uses `completeTaskIfEligible`, preserving the approved-goal acceptance gate, actual artifacts, verification commands, evidence, Git boundary, unresolved violation, and reviewer approval requirements.
- `NextTaskSelectorService` filters candidates to the same approved goal, requires `ready` status and completed dependencies, and rejects candidates affected by blocking issues or pending decisions. It returns a candidate without starting another goal or silently bypassing a user gate.
- The review-loop API supports `review`, `rework`, and `advance` operations while the existing read-only review API remains available.

## Verification results

- TASK-044 specialized integration tests: 3/3 passed.
- TASK-043 review regression tests: 3/3 passed.
- Full `npm run verify`: 66 unit tests, 113 integration tests, 14 Playwright tests, formatting, lint, typecheck, and all workspace builds passed.
- The full verification used a temporary test-process compatibility shim only for the host Node/Windows `uv_os_get_passwd` resource error; it was removed and is not part of the project changes.

## Scope confirmation

- No new goal is started, no user decision is bypassed, and no task outside the approved GOAL-009 review loop is selected.
- TASK-045, TASK-047, and all other later tasks were not executed or modified.
- The review loop does not write project files for the reviewer, commit, merge, or remediate executor changes.

## Independent acceptance suggestion

1. Run `npx tsx --test apps/server/test/review-loop.integration.test.ts` and confirm all three scenarios pass.
2. Confirm the first review produces `changes_requested`, the task becomes `changes_requested`, and rework is accepted only for the executor.
3. Confirm the second report references the first report, increments `reviewRound`, and preserves `reviewerInstanceId`.
4. Confirm an accepted review without the goal acceptance approval remains `waiting_for_approval`, while an approved goal with an eligible same-goal task completes the current task and selects that task.
5. After acceptance, mark `REPORT-047` as `accepted` and `TASK-044` as `completed`; only then decide whether to unlock TASK-045 or TASK-047.
