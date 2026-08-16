---
schema_version: 1
id: TASK-083
title: 实现 Adapter 配置与能力诊断界面
status: draft
goal_id: GOAL-015
role: implementer
dependencies: [TASK-078, TASK-082]
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
target_branch: goal/GOAL-015
unblocked_by: TASK-082
---

# TASK-083：实现 Adapter 配置与能力诊断界面

## 目的与范围

在系统模块中向非技术用户展示可用 Runtime、能力、配置问题和安全测试结果。

## 验收条件

- 显示 Adapter 版本、状态、能力、默认用途和最近预检；
- 可配置非敏感参数与密钥引用名，不显示密钥值；
- 提供只读、结构化输出、文件编辑、续接、取消和清理能力测试；
- 测试明确区分通过、阻断、未知和失败；
- 任何真实测试均先展示影响范围并使用临时项目；
- 页面保持紧凑布局和明确下一步提示。

## 验证

运行前端、集成、Chromium 诊断场景和完整验证。

## 边界与交接

不得从 UI 导出或回显用户凭据。
