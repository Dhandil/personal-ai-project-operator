---
schema_version: 1
id: GOAL-009
title: 完成自动执行审核和交接
status: in_progress
revision: 2
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-15T04:20:22Z
tasks: [TASK-042, TASK-043, TASK-044, TASK-045, TASK-046, TASK-047, TASK-048]
approval_ids: [APPROVAL-004]
target_branch: goal/GOAL-009
unblocked_by: GOAL-008
first_task_id: TASK-042
---

# GOAL-009：完成自动执行、审核和交接

## 目标

完成执行、事实校验、只读审核、返工复审、自动推进、进度展示和真实 CLI 端到端验收；优先支持当前可用的 Claude Code CLI，并保留 Codex CLI 适配路线。

## 验收

- Agent 声明不能绕过实际成果校验；
- 执行—审核—返工—复审—提交—交接闭环通过；
- V0.2 全部成功标准由用户验收。

## 启动状态

- 用户已批准并启动本目标，审批记录为 APPROVAL-004。
- 首个建议任务为 TASK-042；其依赖已满足并已解锁为 `ready`。
- TASK-046 因 Codex CLI 环境不可用已暂停并存档；TASK-048 作为当前 Claude Code CLI 适配任务已解锁为 `ready`。
- TASK-047 依赖 TASK-048 的独立验收，仍保持 `draft`，不会自动启动。
