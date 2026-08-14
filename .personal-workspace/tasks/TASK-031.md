---
schema_version: 1
id: TASK-031
title: 使用本项目治理本项目
status: completed
goal_id: GOAL-006
role: project-lead
dependencies: [TASK-030]
revision: 4
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T13:43:29Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-030
verification_report_id: REPORT-032
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

## 完成证据

- 已执行 `npm run dogfood`，从 3 个阶段文件、9 个目标文件、47 张任务卡、1 条审批和 31 份既有报告建立导入清单。
- 已生成 `.personal-workspace/project.md`、`.personal-workspace/workflow.md`、`.personal-workspace/status.md`、`.personal-workspace/dogfooding/TASK-031-manifest.json` 和 REPORT-032。
- `status.md`、`.personal-workspace/tasks/todo.md` 与 `tasks/todo.md` 均由正式文件重建；历史阶段文件未被覆盖。
- 专项测试 3/3 通过；完整 `npm run verify` 通过。

## 交接

- 用户已完成 REPORT-032 验收，报告状态为 `accepted`。
- GOAL-007 已批准但尚未启动；TASK-032 已按依赖解锁为 `ready`。
