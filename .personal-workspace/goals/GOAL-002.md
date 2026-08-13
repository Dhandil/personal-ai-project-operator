---
schema_version: 1
id: GOAL-002
title: 建立治理领域模型
status: draft
revision: 1
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T12:29:07Z
tasks: [TASK-005, TASK-006, TASK-007, TASK-008, TASK-009]
---

# GOAL-002：建立治理领域模型

## 目标

用不依赖 Web、文件系统、Git 或具体 Agent 的纯领域代码表达项目治理对象、状态转换、审批和完成规则。

## 验收

- 所有核心对象和非法状态转换均有单元测试；
- 审批门、角色边界和任务完成判定可独立验证；
- Domain 不依赖基础设施框架。
