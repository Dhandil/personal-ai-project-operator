---
schema_version: 1
id: TASK-077
title: 定义版本化 Adapter SDK 与能力契约
status: draft
goal_id: GOAL-015
role: architect
dependencies: []
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
target_branch: goal/GOAL-015
unblocked_by: GOAL-014
---

# TASK-077：定义版本化 Adapter SDK 与能力契约

## 目的与范围

把现有 Runtime 接口整理为可扩展、可版本化的 Adapter SDK，统一 CLI 与 API Agent 的启动、事件、结果、取消、续接、清理和能力声明。

## 验收条件

- SDK 声明版本兼容规则和结构化错误分类；
- 能力至少区分文件读写、命令、结构化输出、会话续接、取消与清理；
- Adapter 不支持的能力在执行前明确阻断；
- Runtime 事件可关联 project、goal、task、role、execution 和 session；
- 契约不包含厂商凭据或具体命令行参数。

## 验证

运行契约兼容性与非法 Adapter 测试及完整验证。

## 边界与交接

本任务不新增实际厂商接入，不改变单执行链限制。
