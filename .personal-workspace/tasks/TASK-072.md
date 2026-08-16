---
schema_version: 1
id: TASK-072
title: 实现 Coding 项目模板
status: draft
goal_id: GOAL-014
role: implementer
dependencies: [TASK-069]
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
target_branch: goal/GOAL-014
unblocked_by: TASK-069
---

# TASK-072：实现 Coding 项目模板

## 目的与范围

提供适用于个人练手项目的轻量 Coding 模板，覆盖想法、发现、Spec、架构、计划、实现、审核和交付。

## 验收条件

- 模板生成默认阶段、角色、审批门和任务卡字段；
- 实现者与只读审核者职责清晰且可由不同 Agent 接替；
- 任务完成、返工、复审、目标验收和 main 合并边界明确；
- 简单项目可保持轻量，不强制企业级文档；
- 模板产物可被工作流页面和项目经理读取。

## 验证

从模板创建临时 Coding 项目并校验生成事实与状态投影。

## 边界与交接

不绑定具体语言、框架或 Runtime。
