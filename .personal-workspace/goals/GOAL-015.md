---
schema_version: 1
id: GOAL-015
title: V0.6 建立多 Runtime Adapter 扩展层
status: draft
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
tasks: [TASK-077, TASK-078, TASK-079, TASK-080, TASK-081, TASK-082, TASK-083, TASK-084]
unblocked_by: GOAL-014
---

# GOAL-015：V0.6 建立多 Runtime Adapter 扩展层

## 目标

建立版本化 Adapter SDK、运行时注册和受控 API 工具网关，让多种 CLI 与 API Agent 共享同一治理边界。

## 验收

- Adapter 能力声明、选择、诊断、超时、取消和清理规则统一；
- Fake、Codex、Claude 迁移后不回退；
- 通用 API Agent 可通过受控工具完成允许范围内的任务；
- 多 Adapter 临时项目验收通过，凭据不进入项目事实。

## 状态

- 本目标为路线草案；只有 GOAL-014 检查点接受后才能申请启动。
