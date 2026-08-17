---
schema_version: 1
id: GOAL-012
title: V0.3 完成项目前期 Agent 编排
status: in_review
revision: 3
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-17T05:51:00Z
tasks: [TASK-055, TASK-056, TASK-057, TASK-058, TASK-059, TASK-060, TASK-061]
approval_ids: [APPROVAL-007]
target_branch: goal/GOAL-012
unblocked_by: GOAL-011
first_task_id: TASK-055
---

## Checkpoint handoff

- TASK-055 through TASK-061 have implementation and independent task-level acceptance evidence.
- The V0.3 temporary-project checkpoint is ready for user acceptance as REPORT-068.
- GOAL-012 remains `in_review`; GOAL-013 and all later goals remain unstarted.

# GOAL-012：V0.3 完成项目前期 Agent 编排

## 目标

让新项目从用户想法依次经过 Idea、Discovery、Spec 和规划草案，在用户统一批准后生成正式目标、角色、任务并解锁第一个任务。

## 验收

- 阶段 Agent、产物更新、审批、失败恢复和前后阶段交接形成闭环；
- Spec 可以生成经过校验但尚不可执行的规划草案；
- 用户批准后才写入正式目标与任务事实；
- V0.3 临时项目端到端验收通过。

## 状态

- 用户已批准启动本目标；
- TASK-055 已解锁，后续任务必须遵守依赖、独立验收和既有自动解锁约定；
- 真实阶段 Agent 的 Runtime 选择、用量与运行边界由后续相关任务定义，TASK-055 不启动真实 Agent。
