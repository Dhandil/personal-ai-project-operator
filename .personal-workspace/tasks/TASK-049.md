---
schema_version: 1
id: TASK-049
title: 重构左侧导航与信息架构
status: completed
goal_id: GOAL-010
role: executor
dependencies: [TASK-047]
revision: 3
created_at: 2026-08-16T06:48:35Z
updated_at: 2026-08-16T07:12:00Z
approval_id: APPROVAL-005
target_branch: goal/GOAL-010
unblocked_by: TASK-047
verification_report_id: REPORT-053
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

## Completion evidence

- 将原顶部扁平导航重构为桌面端常驻左侧栏，按“工作区”“当前项目”“运行与治理”组织全部既有页面；新增 `/projects` 项目总览入口，保留项目首页 `/` 的既有内容。
- 工作区包含项目首页、新建项目和服务状态；当前项目包含项目总览、工作流、目标与任务、任务卡和角色；运行与治理包含执行、审批、问题与决策、历史和报告。
- 当前路由同时使用视觉高亮和 `aria-current="page"`；窄于 840px 时由带 `aria-expanded` 的按钮替代常驻侧栏，480px 实测展开完整且无横向溢出。
- TASK-049 专项测试通过：导航模型 13/13，Chromium 桌面与窄屏场景 2/2；完整 `npm run verify` 通过 73 个单元测试、125 个集成测试、17 个 Playwright 测试，以及格式、Lint、类型检查和全部构建。
- Implementation commit: `b1571ef` (`feat(web): 重构左侧导航与信息架构`, `Tasks: TASK-049`).

## Handoff

- TASK-049 已通过项目负责人独立验收，状态为 `completed`；REPORT-053 已接受。
- TASK-050、TASK-051、TASK-052 未执行、未修改，继续保持 `draft`；只有 TASK-049 验收通过后才可决定是否解锁 TASK-050。

## Acceptance

- 独立验收通过：导航模型专项测试 13/13，Chromium 导航场景 2/2。
- 验收范围仅覆盖 TASK-049；未执行 TASK-050、TASK-051 或 TASK-052。
