---
schema_version: 1
id: APPROVAL-004
approval_type: goal_start
subject_id: GOAL-009
decision: approved
status: approved
revision: 1
decided_by: user
created_at: 2026-08-15T04:20:22Z
updated_at: 2026-08-15T04:20:22Z
baseline_commit: f2719410993335f2901f5d92dba8ba2824c4969c
target_branch: goal/GOAL-009
approved_tasks: [TASK-042, TASK-043, TASK-044, TASK-045, TASK-046, TASK-047]
---

# APPROVAL-004：批准并启动 GOAL-009

## 决定

用户已验收 REPORT-044，确认 GOAL-008 完成，并批准启动 GOAL-009“完成自动执行审核和交接”。允许在获批边界内按依赖顺序推进 TASK-042 至 TASK-047；首个建议任务为 TASK-042。

## 授权边界

- 允许实现执行成果校验、只读审核、返工复审、自动下一任务、进度控制台和真实 Codex CLI 端到端验收；
- TASK-042 作为首个任务，必须继续遵守其成果差异、证据校验和获批验证命令边界；
- 后续任务只能在依赖满足、前置任务独立验收通过且正式状态解锁后推进；
- 不允许扩大 GOAL-009 范围，不允许绕过用户批准、任务状态或审核门；
- `main` 合并仍需新的用户批准，禁止 force、历史改写和未经授权的远程操作。

## Git 边界

- 目标分支：`goal/GOAL-009`；
- 基线：`f2719410993335f2901f5d92dba8ba2824c4969c`；
- 任务实现和验证提交进入目标分支；
- 目标完成后必须经过独立审核和用户验收。
