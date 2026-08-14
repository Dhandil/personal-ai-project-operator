---
schema_version: 1
id: TASK-028
title: Implement real-time events, execution reports, and summary interval settings
status: changes_requested
goal_id: GOAL-005
role: executor
dependencies: [TASK-012, TASK-020]
revision: 4
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T10:42:10Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-020
verification_report_id: REPORT-027
---

# TASK-028: Implement real-time events, reports, and summary settings

## Purpose and scope

Provide an SSE event stream with cursor replay, audit-backed execution reports, immediate report categories for completion, blockers, privilege violations, recovery, and decisions, plus global/project summary interval settings.

## Acceptance criteria

- SSE reconnects can resume after the last event cursor.
- Long-task summaries default to 10 minutes and accept a project override.
- Completion, blocker, privilege, recovery, and decision events are reported immediately from actual audit evidence.

## Implementation evidence

- Added `SseHub`, replayable project event history, SSE API route, and browser subscription client with `lastEventId` support.
- Added `ReportService` deriving report categories and evidence references from `.personal-workspace/audit/events.jsonl`.
- Added `SettingsService` for the 10-minute default, global setting, and project override.
- Added `SummaryScheduler` with configurable intervals and rescheduling after each summary callback.
- Added `/projects/reports` page showing evidence and saving project summary intervals.
- Full `npm run verify` passed: 61 unit tests, 47 integration tests, 8 Playwright Chromium tests, formatting, lint, type checks, and builds.

## Review note

- Live `publishAuditEvent` currently assigns the constant report id `REPORT-001`; the reports page de-duplicates live reports by id. Consecutive live audit events can therefore be hidden as duplicates. Assign a unique, event-derived report id and add a regression test covering at least two consecutive live events before returning this task to `completed`.

## Boundary and handoff

Reports cite persisted audit evidence and do not treat chat text as facts. This completes the GOAL-005 event/report checkpoint for handoff to the next governed task.
