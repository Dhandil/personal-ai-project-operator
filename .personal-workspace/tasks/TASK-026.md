---
schema_version: 1
id: TASK-026
title: Implement issues, discussions, decisions, and affected-task pausing
status: completed
goal_id: GOAL-005
role: executor
dependencies: [TASK-008, TASK-009, TASK-020]
revision: 4
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T10:42:10Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-020
verification_report_id: REPORT-026
---

# TASK-026: Implement issue coordination and affected-task pausing

## Purpose and scope

Record user issues, agent discussion, proposed options, user decisions, affected objects, and recovery actions in project facts. Apply the issue impact policy without changing unrelated tasks.

## Acceptance criteria

- Known impact pauses only explicitly affected tasks.
- Unknown impact pauses the current execution chain and preserves the current task context for recovery.
- Discussion, options, user decision rationale, affected tasks, and recovery results are traceable through API, Markdown facts, and audit events.

## Implementation evidence

- Added `IssueService` with issue, discussion, decision, recovery, impact-plan, task pause/resume, and audit coordination.
- Added issue API routes and the `/projects/issues` page with issue creation, scope display, decision recording, and recovery controls.
- Added backend integration tests for known and unknown impact, task pause/resume, decision persistence, and traceability.
- Added frontend contract, route, and Chromium scenario tests.
- Full `npm run verify` passed: 59 unit tests, 44 integration tests, 7 Playwright Chromium tests, formatting, lint, type checks, and builds.

## Boundary and handoff

The executor records and applies the explicit impact policy; it does not replace user scope or architecture decisions. Further handoff work proceeds through TASK-036.
