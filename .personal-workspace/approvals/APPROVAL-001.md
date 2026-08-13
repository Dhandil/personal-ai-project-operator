---
schema_version: 1
id: APPROVAL-001
approval_type: goal_start
subject_id: GOAL-001
decision: approved
status: approved
revision: 1
decided_by: user
created_at: 2026-08-13T13:40:49Z
updated_at: 2026-08-13T13:40:49Z
baseline_commit: 37a5f1dcd06d8f6cce1eac217bb90cc1a21f80f3
target_branch: goal/GOAL-001
approved_tasks: [TASK-001, TASK-002, TASK-003, TASK-004]
---

# APPROVAL-001：批准并启动 GOAL-001

## 决定

用户批准启动 GOAL-001“建立可运行工程”，允许在该目标边界内按依赖顺序实施 TASK-001～TASK-004。

## 授权边界

- 允许建立 npm Workspace、严格 TypeScript 根配置、Fastify 后端骨架、React/Vite 中文界面骨架和根级质量命令；
- 允许安装正式 Spec 已确认且本目标实际需要的开发依赖；
- TASK-001 完成并验证后，才可按依赖关系启动后续任务；
- 不允许加入业务领域功能、数据库、Agent 调度、已有项目导入或其他未确认需求；
- 不允许修改 GOAL-001 的范围、技术约束或验收条件，发现问题时必须提出并由用户决定；
- GOAL-001 完成后必须由独立审核者审核，再交用户验收；
- 本批准不授权启动 GOAL-002～GOAL-009，也不授权合入 `main`。

## Git 边界

- 目标分支：`goal/GOAL-001`；
- 基线：`37a5f1dcd06d8f6cce1eac217bb90cc1a21f80f3`；
- 任务实现和验证提交进入目标分支；
- 合入 `main` 需要新的用户批准。
