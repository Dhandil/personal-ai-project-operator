---
schema_version: 1
id: TASK-052
title: 优化页面布局和滚动体验
status: draft
goal_id: GOAL-010
role: executor
dependencies: [TASK-049, TASK-050, TASK-051]
revision: 1
created_at: 2026-08-16T06:48:35Z
updated_at: 2026-08-16T06:48:35Z
approval_id: APPROVAL-005
target_branch: goal/GOAL-010
unblocked_by: TASK-051
---

# TASK-052：优化页面布局和滚动体验

## 目的与范围

在不隐藏关键事实和操作的前提下提高桌面端信息密度，减少常用页面的大段纵向滚动。

## 验收条件

- 项目总览、工作流、审批、执行和历史页面采用更紧凑的一致布局；
- 长列表支持折叠、分区、分页或局部滚动，避免整个页面无限拉长；
- 页面标题、当前状态和主要操作在常见桌面窗口首屏可见；
- 不以缩小到难以阅读的字号换取密度；
- 键盘导航、焦点、移动或窄窗口行为不回退；
- 增加关键页面视觉与交互回归测试。

## 边界与交接

- 不删除治理事实、风险、审批理由或审计信息；
- 不改变任务状态和审批语义；
- 完成后生成 GOAL-010 检查点报告，等待用户验收。
