---
schema_version: 1
id: APPROVAL-005
approval_type: goal_start
subject_id: GOAL-010
decision: approved
status: approved
revision: 1
decided_by: user
created_at: 2026-08-16T06:48:35Z
updated_at: 2026-08-16T06:48:35Z
baseline_commit: ae787b38e65afa250a6df3fd778915482d7fcbcf
target_branch: goal/GOAL-010
approved_tasks: [TASK-049, TASK-050, TASK-051, TASK-052]
---

# APPROVAL-005：批准并启动 GOAL-010

## 决定

用户批准按照已确认的第一轮真实试用反馈启动 GOAL-010“工作台基础可用性改进”，允许按依赖顺序执行 TASK-049 至 TASK-052。

## 授权边界

- 允许修改前端导航、工作流引导、项目目录选择和页面布局；
- 允许增加实现上述改进所必需的本地后端接口与测试；
- 不改变既有项目治理事实模型、审批门和 Git 安全边界；
- 不执行真实项目 `main` 合并；
- 每个任务完成后提交独立验收报告，再解锁后续任务。
