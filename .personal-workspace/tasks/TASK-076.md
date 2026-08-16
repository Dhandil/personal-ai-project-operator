---
schema_version: 1
id: TASK-076
title: 完成 V0.5 双类型项目验收
status: draft
goal_id: GOAL-014
role: reviewer
dependencies: [TASK-070, TASK-071, TASK-072, TASK-073, TASK-074, TASK-075]
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
target_branch: goal/GOAL-014
unblocked_by: TASK-075
---

# TASK-076：完成 V0.5 双类型项目验收

## 目的与范围

以一个 Coding 项目和一个知识生产项目验证新建、导入、模板配置与治理闭环。

## 验收条件

- 新建 Coding 项目可从前期流程进入受控实现与审核；
- 导入已有项目不覆盖原文件且可恢复状态；
- 知识生产项目跑通生产、只读审核、返工和复审；
- 两类项目都由同一核心状态、审批、审计与报告机制管理；
- 所有测试使用临时目录并自动安全清理；
- 生成 V0.5 检查点报告并由用户接受。

## 验证

运行 V0.5 专项 E2E 与完整 `npm run verify`。

## 边界与交接

不得自动启动 GOAL-015；验收结论必须区分模板问题和核心治理问题。
