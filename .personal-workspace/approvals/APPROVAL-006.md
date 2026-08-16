---
schema_version: 1
id: APPROVAL-006
approval_type: goal_start
subject_id: GOAL-011
decision: approved
status: approved
revision: 1
decided_by: user
created_at: 2026-08-16T10:15:00Z
updated_at: 2026-08-16T10:15:00Z
baseline_commit: 3c4d4cb1c0d418ce01180dcb994048bc85e30918
target_branch: goal/GOAL-011
approved_tasks: [TASK-053, TASK-054]
---

# APPROVAL-006：批准并启动 GOAL-011

## 决定

用户明确要求先完成“重新设计导航”和“所有页面尽量避免上下滑动”两项修改，并制定正式任务交给实现对话执行。由此批准启动 GOAL-011“重构两级导航与全页面视口布局”。

## 授权边界

- 允许修改 Web 应用外壳、一级/二级导航、现有页面布局、滚动容器、响应式规则和相关测试；
- 允许调整既有路由入口的展示层级，但不得删除页面、破坏深链接或改变页面业务语义；
- 不改变项目事实模型、审批门、Agent 执行语义、审计、Git 安全边界或后端业务流程；
- TASK-053 独立验收通过后自动解锁 TASK-054，无需再次询问用户；
- 自动解锁不等于越过独立验收；不得自动启动其他目标或执行真实项目 `main` 合并。
