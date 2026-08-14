---
schema_version: 1
id: TASK-033
title: 实现差异允许路径和禁止动作校验
status: completed
goal_id: GOAL-007
role: executor
dependencies: [TASK-032]
revision: 4
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T14:43:26Z
approval_id: APPROVAL-002
target_branch: goal/GOAL-007
unblocked_by: TASK-032
verification_report_id: REPORT-035
---

# TASK-033：实现差异、允许路径和禁止动作校验

## 目的与范围

比较任务执行前后的 Git 状态和文件系统变化，并按任务卡允许/禁止边界判定违规。

## 验收条件

- 检查已跟踪、未跟踪、重命名和删除文件；
- 越界变化阻止验收并进入审计；
- Windows 路径规范化不能绕过边界。

## 验证

`npm run test:integration -- change-boundary`，覆盖路径穿越和大小写场景。

## 预计文件

差异采集 Adapter、路径策略、变化验证服务、违规契约、集成测试。

## 边界与交接

不得自动删除越界文件。完成后交给 TASK-034、042。

## 完成证据

- 新增 `GitChangeBoundaryService` 与 `evaluateGitBoundary`，从临时 Git 仓库采集 HEAD、分支、已跟踪/未跟踪状态、修改、添加、删除、重命名/复制及内容哈希，并比较执行前后变化。
- 允许路径和禁止路径均按相对路径、目录边界和 Windows 大小写规则规范化；绝对路径与 `..` 穿越会被拒绝，重命名同时检查旧路径和新路径。
- 默认禁止 force push、历史重写、远程操作和直接写入 main；越界、非法路径、分支/HEAD 变化及禁止动作均返回结构化违规报告，阻止通过且不自动删除文件。
- 提供带执行 ID 和时间的审计上下文入口；存在违规时追加 `privilege_violation` 审计事件，审计失败会阻止校验成功返回。
- 专项测试 3/3、完整集成测试 65/65、单元测试 64/64、Chromium Playwright 14/14，以及格式、Lint、类型检查和构建全部通过。

## 交接

- [REPORT-035](../reports/REPORT-035.md) 独立验收已通过，报告状态为 `accepted`。
- TASK-034 已按依赖解锁为 `ready`；规范提交、目标分支合并和 main 审批门仍留给 TASK-034。
