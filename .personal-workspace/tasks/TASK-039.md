---
schema_version: 1
id: TASK-039
title: 实现 codex exec 启动及 JSONL 事件解析
status: ready
goal_id: GOAL-008
role: executor
dependencies: [TASK-035, TASK-037, TASK-038]
revision: 2
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T17:50:43Z
approval_id: APPROVAL-003
target_branch: goal/GOAL-008
unblocked_by: TASK-038
---

# TASK-039：实现 `codex exec` 启动及 JSONL 事件解析

## 目的与范围

以参数数组安全启动 Codex 非交互任务，解析 JSONL 事件和最终结构化输出。

## 验收条件

- 工作目录精确指向任务 Worktree；
- 执行者为 workspace-write，审核者为 read-only；
- 捕获 thread ID、进度、命令、文件变化、最终结果和错误。

## 验证

Fake Process 集成测试覆盖分片、坏行、失败退出和结构错误。

## 预计文件

Codex CLI Adapter、参数构建器、JSONL 解析器、进程事件桥、集成测试。

## 边界与交接

禁止 shell 字符串拼接、yolo 或 danger-full-access。完成后交给 TASK-040、041、042、043。
