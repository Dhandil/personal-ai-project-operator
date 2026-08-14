---
schema_version: 1
id: TASK-017
title: 实现项目初始化预览
status: ready
goal_id: GOAL-004
role: executor
dependencies: [TASK-013, TASK-015, TASK-016]
revision: 2
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T05:58:43Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-015, TASK-016
---

# TASK-017：实现项目初始化预览

## 目的与范围

根据目录和想法生成治理结构、默认流程、角色、Git 动作和基线提交的无副作用预览。

## 验收条件

- 预览明确列出所有新增和可能冲突文件；
- 预览包含 Git 计划和默认设置；
- 生成预览不会改变目标目录、索引或 Git。

## 验证

`npm run test:integration -- project-init-preview`；比较预览前后目录和 Git 状态。

## 预计文件

初始化预览用例、预览契约、默认模板清单、API Route、集成测试。

## 边界与交接

不得把“预览”与“执行”放在同一隐式操作中。完成后交给 TASK-018。
