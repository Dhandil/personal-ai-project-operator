---
schema_version: 1
id: TASK-028
title: 实现实时事件报告和摘要间隔设置
status: draft
goal_id: GOAL-005
role: executor
dependencies: [TASK-012, TASK-020]
revision: 1
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T12:29:07Z
---

# TASK-028：实现实时事件、报告和摘要间隔设置

## 目的与范围

建立 SSE 事件通道、执行摘要、关键事件即时记录及全局/项目摘要间隔设置。

## 验收条件

- SSE 断线后能使用事件游标恢复；
- 长任务默认每 10 分钟摘要，项目可覆盖；
- 完成、阻塞、越权、恢复和待决策立即报告。

## 验证

SSE 集成测试、时间控制测试和报告页面检查。

## 预计文件

SSE Hub、报告服务、设置 Route、事件订阅 Client、测试。

## 边界与交接

报告必须引用实际证据，不把聊天文本当事实。完成后提交 GOAL-005 检查点。
