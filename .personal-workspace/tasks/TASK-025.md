---
schema_version: 1
id: TASK-025
title: Implement task card dependencies and lightweight custom fields
status: completed
goal_id: GOAL-005
role: executor
dependencies: [TASK-007, TASK-020, TASK-023]
revision: 3
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T11:45:00Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-023
---

# TASK-025: Implement task cards, dependencies, and lightweight custom fields

## Purpose and scope

Provide governed task-card creation and editing, dependency validation, cycle rejection, stable role assignment, and simple custom fields without introducing a complex form-builder.

## Acceptance criteria

- Required task, permission, verification, and handoff fields are complete and cannot be removed through edits.
- Missing dependencies and circular dependencies are rejected.
- Optional custom fields can be edited or omitted; unknown YAML fields survive round trips.
- Task writes use atomic governance files, revision/hash conflict checks, and audit events.

## Implementation evidence

- Added `TaskService` with task creation, editing, ready transition, role validation, dependency graph checks, and audit logging.
- Added task Markdown/YAML encoding that merges known fields into existing front matter and preserves unknown YAML keys.
- Added `/api/projects/tasks`, `/api/projects/tasks/update`, and `/api/projects/tasks/ready` routes.
- Added `/projects/tasks` task list/editor page with dependency, role, and priority custom-field controls.
- Added integration tests for creation, role assignment, required fields, custom fields, unknown YAML preservation, missing dependencies, circular dependencies, and revision/hash conflicts.
- Added frontend contract and Chromium task-editor tests.
- Full `npm run verify` passed: 63 unit tests, 50 integration tests, 9 Playwright Chromium tests, formatting, lint, type checks, and builds.

## Handoff and boundary

The implementation intentionally keeps custom fields lightweight: text, number, boolean, date, single-select, and file-reference values remain governed by the existing domain validator. Complex form-builder work is out of scope. Handoff proceeds to TASK-036/037; TASK-027 and TASK-029 were not implemented.
