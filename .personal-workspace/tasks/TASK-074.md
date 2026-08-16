---
schema_version: 1
id: TASK-074
title: 实现轻量模板自定义
status: draft
goal_id: GOAL-014
role: implementer
dependencies: [TASK-069, TASK-072, TASK-073]
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
target_branch: goal/GOAL-014
unblocked_by: TASK-073
---

# TASK-074：实现轻量模板自定义

## 目的与范围

允许个人用户在创建或导入项目时调整工作流、角色、任务卡字段和审批门，同时保持核心治理约束。

## 验收条件

- 可增加或删除非核心阶段、角色与任务卡自定义字段；
- 可增加自定义审批门，跳过阶段仍需记录理由；
- 必需标识、revision/hash、审计和用户最终批准不可删除；
- 自定义结果先预览后应用并记录差异；
- 非法依赖、循环阶段和冲突字段被拒绝。

## 验证

覆盖默认模板、合法自定义和非法配置并运行完整验证。

## 边界与交接

V0.5 不提供任意脚本插件或在线模板市场。
