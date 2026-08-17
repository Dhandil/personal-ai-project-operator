---
schema_version: 1
id: TASK-059
title: 从 Spec 生成目标角色与任务草案
status: completed
goal_id: GOAL-012
role: executor
dependencies: [TASK-057, TASK-058]
revision: 4
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-17T11:50:00Z
target_branch: goal/GOAL-012
unblocked_by: TASK-058
---

## Implementation evidence

- Added the vendor-neutral `PlanningDraft` domain model with validation for IDs, dependencies, cycles, role keys, and safe relative paths.
- Added `PlanningDraftService` and API routes for generate, read, edit, reject, and approve.
- Generated drafts are stored separately at `.personal-workspace/stages/03-spec/planning-draft.md`; regeneration preserves an existing candidate and unknown front-matter fields.
- Approval revalidates the approved Spec revision/hash, writes formal goal/role/task facts atomically per file, marks only the first dependency-free task `ready`, and returns a recovery plan on partial failure.
- No Agent was started and no formal GOAL/TASK facts were written by the implementation itself.
- Implementation commit: `36bd5e0`.

## Verification evidence

- Planning domain tests: 6/6 passed.
- Planning service/API integration tests: 4/4 passed.
- Full `npm run verify`: 103 unit tests, 141 integration tests, 22 Chromium tests, formatting, lint, type checks, and builds all passed.

## Handoff

REPORT-065 has been independently accepted by the project owner. Candidate/fact separation, user edit preservation, dependency validation, approval atomicity/recovery behavior, and TASK-060 isolation were verified. TASK-059 is `completed`; TASK-060 is unlocked as `ready`.

## Independent acceptance

- Planning domain tests: 6/6; service/API integration tests: 4/4.
- Full `npm run verify`: 103 unit, 141 integration, and 22 Chromium tests passed, with quality checks and builds passing.

# TASK-059：从 Spec 生成目标角色与任务草案

## 目的与范围

让规划 Agent 读取已批准 Spec，生成可校验、可编辑但尚不可执行的目标、角色和任务卡草案。

## 验收条件

- 草案包含目标、角色、任务、依赖、验收条件、必读/按需文件、允许路径和验证命令；
- ID、依赖缺失、重复、循环、越界路径和未知角色会被拒绝；
- 草案与正式事实分离，重新生成不会覆盖用户编辑；
- 用户可逐项修改后统一批准或退回；
- 批准写入使用原子事务语义，部分失败返回恢复计划；
- 只有批准成功后第一个无依赖任务才可转为 `ready`。

## 验证

运行草案 Schema、依赖图、批准原子性和恢复集成测试，再运行 `npm run verify`。

## 边界与交接

规划 Agent 只能建议，不得自行批准、启动目标或执行任务。完成后 TASK-060 可申请解锁。
