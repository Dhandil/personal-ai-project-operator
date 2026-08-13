---
schema_version: 1
id: GOAL-008
title: 接入 Codex CLI
status: draft
revision: 1
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T12:29:07Z
tasks: [TASK-035, TASK-036, TASK-037, TASK-038, TASK-039, TASK-040, TASK-041]
---

# GOAL-008：接入 Codex CLI

## 目标

通过稳定 Agent Runtime 接口接入 Codex CLI，支持受控执行、结构化事件、续接、恢复和会话清理。

## 验收

- 模拟 Adapter 覆盖全部关键失败模式；
- Codex CLI 执行者和只读审核者可以正确启动；
- 中断与会话生命周期可恢复且可审计。
