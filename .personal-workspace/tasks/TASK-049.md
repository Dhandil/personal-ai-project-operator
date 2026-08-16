---
schema_version: 1
id: TASK-049
title: 重构左侧导航与信息架构
status: ready
goal_id: GOAL-010
role: executor
dependencies: [TASK-047]
revision: 1
created_at: 2026-08-16T06:48:35Z
updated_at: 2026-08-16T06:48:35Z
approval_id: APPROVAL-005
target_branch: goal/GOAL-010
unblocked_by: TASK-047
---

# TASK-049：重构左侧导航与信息架构

## 目的与范围

把当前顶部扁平导航重构为左侧分组导航，区分工作区级功能、当前项目功能和运行治理功能。

## 验收条件

- 左侧导航至少包含“工作区”“当前项目”“运行与治理”分组；
- 项目首页、新建项目、服务状态归入工作区；
- 项目总览、工作流、目标与任务、角色归入当前项目；
- 执行、审批、历史和报告归入运行与治理；
- 当前路由有清晰选中状态，所有既有页面仍可到达；
- 桌面窗口下导航稳定，窄窗口具备合理收起或替代行为；
- 更新相关组件测试和 Playwright 导航场景。

## 边界与交接

- 不在本任务内重写各业务页面内容；
- 不改变审批、执行和历史的领域行为；
- 完成后生成独立报告，验收通过后再执行 TASK-050。
