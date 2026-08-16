---
schema_version: 1
id: TASK-069
title: 定义项目类型与模板契约
status: draft
goal_id: GOAL-014
role: architect
dependencies: []
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
target_branch: goal/GOAL-014
unblocked_by: GOAL-013
---

# TASK-069：定义项目类型与模板契约

## 目的与范围

定义项目模板、模板版本、可配置项和生成结果的厂商无关契约，为 Coding 与知识生产项目提供同一治理内核。

## 验收条件

- 模板声明工作流、角色、默认任务字段、审批门和必需阶段产物；
- 模板版本可追踪，生成项目记录采用的模板版本；
- 模板配置与项目动态状态分离；
- 未知项目类型不会静默套用默认模板；
- 契约具备单元测试和迁移边界说明。

## 验证

运行模板契约专项测试与完整 `npm run verify`。

## 边界与交接

本任务不实现导入或 UI；完成后 TASK-070、TASK-072、TASK-073 可按依赖推进。
