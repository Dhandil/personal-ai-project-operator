---
schema_version: 1
id: TASK-031
title: 使用本项目治理本项目
status: draft
goal_id: GOAL-006
role: project-lead
dependencies: [TASK-030]
revision: 1
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T12:29:07Z
---

# TASK-031：使用本项目治理本项目

## 目的与范围

把当前手工创建的规划事实导入 V0，验证本项目能够由自身工具读取、重建和继续管理。

## 验收条件

- 当前阶段、目标和任务被 V0 正确读取且无信息丢失；
- 状态快照和 Skill 兼容视图可由正式事实重建；
- 形成 Dogfooding 报告并由用户完成 V0 验收。

## 验证

`npm run verify`；手工对照正式文件、应用视图和重建结果。

## 预计文件

导入/校验脚本、Dogfooding 报告、必要迁移映射、测试及状态重建产物。

## 边界与交接

不得覆盖未经确认的历史阶段内容。用户验收 V0 后才可启动 GOAL-007。
