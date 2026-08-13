---
schema_version: 1
id: TASK-012
title: 实现追加式审计事件记录
status: draft
goal_id: GOAL-003
role: executor
dependencies: [TASK-011]
revision: 1
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T12:29:07Z
---

# TASK-012：实现追加式审计事件记录

## 目的与范围

实现 `audit/events.jsonl` 追加写入、事件 Schema 和按项目读取能力。

## 验收条件

- 事件只能追加且每行独立可解析；
- 失败、越权、恢复和正式状态变化可关联对象与执行；
- 尾部损坏能被识别并报告。

## 验证

`npm run test:integration -- audit-log`。

## 预计文件

审计事件契约、审计 Repository、JSONL 编解码、集成测试和测试夹具。

## 边界与交接

禁止修改既有事件。完成后交给 TASK-013 和后续报告功能。
