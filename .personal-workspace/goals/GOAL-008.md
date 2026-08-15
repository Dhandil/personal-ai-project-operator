---
schema_version: 1
id: GOAL-008
title: 接入 Codex CLI
status: completed
revision: 4
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-15T04:20:22Z
tasks: [TASK-035, TASK-036, TASK-037, TASK-038, TASK-039, TASK-040, TASK-041]
approval_ids: [APPROVAL-003]
target_branch: goal/GOAL-008
verification_report_id: REPORT-044
---

# GOAL-008：接入 Codex CLI

## 目标

通过稳定 Agent Runtime 接口接入 Codex CLI，支持受控执行、结构化事件、续接、恢复和会话清理。

## 验收

- 模拟 Adapter 覆盖全部关键失败模式；
- Codex CLI 执行者和只读审核者可以正确启动；
- 中断与会话生命周期可恢复且可审计。

## 当前状态

- 已由用户批准并启动；
- TASK-035 已完成并作为本目标前置成果保留；
- 首个建议任务为 TASK-036，尚未开始执行；
- 后续任务仍按依赖关系和正式解锁状态推进；
- 本目标完成后必须经过独立审核和用户验收。

## 检查点

- TASK-035 至 TASK-041 已全部完成并通过独立验收。
- GOAL-008 检查点报告 REPORT-044 已生成，当前等待用户验收。
- GOAL-009 未启动；TASK-042 及后续任务保持未解锁。

## 用户验收

- 用户已接受 REPORT-044。
- GOAL-008 已完成；GOAL-009 经 APPROVAL-004 批准并启动。
