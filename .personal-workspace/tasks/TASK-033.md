---
schema_version: 1
id: TASK-033
title: 实现差异允许路径和禁止动作校验
status: ready
goal_id: GOAL-007
role: executor
dependencies: [TASK-032]
revision: 2
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T14:05:08Z
approval_id: APPROVAL-002
target_branch: goal/GOAL-007
unblocked_by: TASK-032
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
