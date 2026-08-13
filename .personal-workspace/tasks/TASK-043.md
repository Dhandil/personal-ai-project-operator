---
schema_version: 1
id: TASK-043
title: 实现只读审核及结构化审核报告
status: draft
goal_id: GOAL-009
role: reviewer
dependencies: [TASK-037, TASK-039, TASK-042]
revision: 1
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T12:29:07Z
---

# TASK-043：实现只读审核及结构化审核报告

## 目的与范围

为需要审核的任务启动独立只读 Agent，并由后端保存结构化审核报告。

## 验收条件

- 审核者运行于 read-only 沙箱；
- 报告引用实际差异、文件、测试和发现；
- 任何写入尝试被阻止、记录且不能进入正式成果。

## 验证

Fake Adapter 审核集成测试及只读违规场景。

## 预计文件

审核协调服务、审核报告 Schema、审核结果 Repository、审核 API Route、测试。

## 边界与交接

审核者只能报告，不得修复。完成后交给 TASK-044。
