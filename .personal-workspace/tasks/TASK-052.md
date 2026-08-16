---
schema_version: 1
id: TASK-052
title: 优化页面布局和滚动体验
status: in_review
goal_id: GOAL-010
role: executor
dependencies: [TASK-049, TASK-050, TASK-051]
revision: 3
created_at: 2026-08-16T06:48:35Z
updated_at: 2026-08-16T09:37:30Z
approval_id: APPROVAL-005
target_branch: goal/GOAL-010
unblocked_by: TASK-051
verification_report_id: REPORT-056
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

## Handoff

- TASK-052 已完成实现，状态为 `in_review`；REPORT-056 等待项目负责人独立验收。
- 项目概览、工作流、审批和历史页面使用统一紧凑布局；长列表改为局部滚动，标题、当前状态和主要操作保持在首屏可见。
- 仅修改前端布局、滚动样式、审批/历史列表语义标记和布局回归测试，未修改正式事实、审批语义或任务状态转换。
- 已生成 GOAL-010 检查点报告 REPORT-057，等待项目负责人验收后再登记 TASK-052 完成和 GOAL-010 完成。

## 完成证据

- 实现提交：`6a5bb5784d6437ca3377d10be839cf6cea56aeda`。
- 完整 `npm run verify`：76 个单元测试、129 个集成测试、18 个 Playwright 测试全部通过；格式、Lint、类型检查和 contracts/domain/server/web 构建全部通过。
- 布局专项 `npx playwright test e2e/layout.spec.ts --config=playwright.config.ts`：1/1 通过，确认长审批/历史列表局部滚动、标题首屏可见和无横向溢出。
- 浏览器检查确认桌面和窄屏布局保留可读字号、语义导航和键盘可达控件；未改变项目事实或治理语义。
