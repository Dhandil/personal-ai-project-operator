---
schema_version: 1
id: APPROVAL-007
approval_type: goal_start
subject_id: GOAL-012
decision: approved
status: approved
revision: 1
decided_by: user
created_at: 2026-08-16T14:40:00Z
updated_at: 2026-08-16T14:40:00Z
baseline_commit: 48c3927c02557a79e5ef627d9c76b2438e63d4b8
target_branch: goal/GOAL-012
approved_tasks: [TASK-055, TASK-056, TASK-057, TASK-058, TASK-059, TASK-060, TASK-061]
---

# APPROVAL-007：批准并启动 GOAL-012

## 决定

用户批准启动 GOAL-012“V0.3 完成项目前期 Agent 编排”。首个执行任务为 TASK-055“定义前期阶段运行与审批状态模型”。

## 授权边界

- 允许为项目前期阶段建立状态模型、角色任务包、阶段产物校验、协调器、规划草案生成与相应控制台；
- 允许增加实现上述能力所必需的本地后端、前端、领域模型和自动化测试；
- 不启动真实阶段 Agent，除非后续任务明确批准并通过 Runtime 预检；
- 不自动批准阶段产物、正式目标、正式任务、目标级检查点或真实项目 `main` 合并；
- 后续任务仅在依赖满足且前一任务独立验收通过后自动解锁，不需再次询问用户；
- 自动解锁不等于自动执行，不得启动 GOAL-013 或其他未批准目标。
