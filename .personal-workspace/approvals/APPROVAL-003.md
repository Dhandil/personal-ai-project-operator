---
schema_version: 1
id: APPROVAL-003
approval_type: goal_start
subject_id: GOAL-008
decision: approved
status: approved
revision: 1
decided_by: user
created_at: 2026-08-14T16:08:23Z
updated_at: 2026-08-14T16:08:23Z
baseline_commit: 83e4ec0dca6108ce6d9d199845f3f7f2f56b0b31
target_branch: goal/GOAL-008
approved_tasks: [TASK-036, TASK-037, TASK-038, TASK-039, TASK-040, TASK-041]
---
# APPROVAL-003：批准并启动 GOAL-008

## 决定

用户批准并启动 GOAL-008“接入 Codex CLI”，允许在已确认的目标边界内按依赖顺序推进任务。TASK-035 已完成并作为本目标的前置成果保留；启动后的首个建议任务为 TASK-036“实现单执行链协调器”。

## 授权边界

- 允许实现厂商无关 Agent Runtime 之上的受控执行、结构化事件、续接、恢复和会话清理能力；
- TASK-036 作为首个建议任务，必须继续遵守其依赖、审批、恢复条件和单执行链约束；
- 后续任务只能在依赖满足、前置任务验收通过且正式状态解锁后推进；
- 不允许扩大 GOAL-008 的范围，不允许提前启动 GOAL-009；
- `main` 合并仍需新的用户批准，禁止 force、历史改写和未经授权的远程操作。

## Git 边界

- 目标分支：`goal/GOAL-008`；
- 基线：`83e4ec0dca6108ce6d9d199845f3f7f2f56b0b31`；
- 任务实现和验证提交进入目标分支；
- 目标完成后必须经过独立审核和用户验收。
