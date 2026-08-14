---
schema_version: 1
id: TASK-035
title: 定义 Agent Runtime 接口和模拟 Adapter
status: ready
goal_id: GOAL-008
role: architect
dependencies: [TASK-009, TASK-028]
revision: 2
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T12:05:00Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-028
---

# TASK-035：定义 Agent Runtime 接口和模拟 Adapter

## 目的与范围

定义与厂商无关的启动、事件、结果、取消、续接和清理端口，并提供确定性模拟实现。

## 验收条件

- 核心接口不含 Codex 专有字段；
- 模拟成功、失败、中断、越权、审核失败、错误输出和清理失败；
- 每个执行都有稳定 EXEC ID 和事件序列。

## 验证

`npm run test:unit -- agent-runtime`；`npm run test:integration -- fake-agent`。

## 预计文件

Agent Runtime 端口、事件契约、结果契约、Fake Adapter、测试。

## 边界与交接

不得把具体 CLI 命令放入 Domain。完成后解锁 TASK-036～039。
