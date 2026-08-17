---
schema_version: 1
id: APPROVAL-008
approval_type: goal_start
subject_id: GOAL-016
decision: approved
status: approved
revision: 1
decided_by: user
created_at: 2026-08-17T08:51:22Z
updated_at: 2026-08-17T08:51:22Z
target_branch: goal/GOAL-016
approved_tasks: [TASK-085, TASK-086, TASK-087, TASK-088, TASK-089, TASK-090, TASK-091]
---

# APPROVAL-008：批准并启动 GOAL-016

## 决定

用户要求先测试项目，记录无法完成的功能，并将问题设置为目标和任务交给实现对话逐项完成；据此批准启动 GOAL-016“修复 V0.3 核心可用性阻塞”。

## 授权边界

- 允许修改真实 Runtime 生产接入、阶段输出解析、目录选择器、每日启动、状态视图、前端空状态和相关测试；
- 允许在临时项目中使用已配置的 Claude Code + DeepSeek 做真实验收；
- 不读取或修改真实个人项目；
- 不改变事实来源、审批门、只读审核、Git 禁止动作和 main 合并审批；
- 任务按依赖顺序执行；独立验收通过后自动解锁下一任务，无需再次询问；
- 自动解锁不等于跳过验收，不得启动 GOAL-013 或其他目标。

