---
schema_version: 1
id: TASK-090
title: 完善核心页面空状态和中文操作说明
status: draft
goal_id: GOAL-016
role: executor
dependencies: [TASK-089]
revision: 1
created_at: 2026-08-17T08:51:22Z
updated_at: 2026-08-17T08:51:22Z
target_branch: goal/GOAL-016
unblocked_by: TASK-089
---

# TASK-090：完善核心页面空状态和中文操作说明

## 目的与范围

让目标、任务、角色、执行、报告和治理页面在空数据、阻塞和未配置 Runtime 时告诉用户“为什么为空、下一步是什么、按钮会做什么”。统一当前明显的英文页面标题和操作文案。

## 验收条件

- 核心页面空状态均有事实原因和明确下一步；
- 不再出现点击后无反馈或只有英文错误提示的核心操作；
- 中文工作台的主要标题、按钮、状态和错误提示一致；
- 不隐藏审批、阻塞、恢复和 Runtime 未配置等重要事实；
- 桌面首屏、局部滚动和窄屏布局回归通过。

## 验证

运行各页面 Chromium 场景、无障碍检查和完整 `npm run verify`。

## 边界与交接

不改变后端业务规则和审批语义；完成后交接给 TASK-091。

