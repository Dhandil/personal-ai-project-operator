---
schema_version: 1
id: TASK-039
title: 实现 codex exec 启动及 JSONL 事件解析
status: completed
goal_id: GOAL-008
role: executor
dependencies: [TASK-035, TASK-037, TASK-038]
revision: 4
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T18:15:45Z
approval_id: APPROVAL-003
target_branch: goal/GOAL-008
unblocked_by: TASK-038
verification_report_id: REPORT-041
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

## 完成证据

- 新增 Codex exec 参数构建器，使用参数数组和 `shell: false` 启动；执行者固定使用 `workspace-write`，审核者固定使用 `read-only`，工作目录原样指向任务 Worktree。
- 新增进程事件桥，捕获进程号、命令、退出码、信号和 stderr；未实现续接、取消或清理生命周期。
- 新增增量 JSONL 解析器，支持分片和 CRLF，拒绝坏 JSON、非对象文档和缺少事件类型的结构错误，并投影为 Agent Runtime 事件。
- Adapter 捕获 thread ID、命令执行、文件变化、最终结构化输出和 stderr，并将非零退出、解析错误和 Codex 错误映射到共享结果契约。
- Fake Process 专项集成测试 4/4 通过，覆盖分片、坏行、结构错误、非零退出、执行者沙箱和审核者沙箱。
- 完整 `npm run verify` 通过：66 个单元测试、88 个集成测试、14 个 Chromium Playwright 测试，以及格式、Lint、类型检查和构建。
- 实现提交：`20ea999`（`feat(agent-runtime): 实现 codex exec 启动与 JSONL 解析`）。

## 交接

- 验证报告为 `REPORT-041`，独立验收已通过，TASK-039 状态为 `completed`。
- 本次未执行 TASK-040、TASK-041、TASK-042、TASK-043 或 GOAL-009；续接、取消、中断恢复和临时会话清理留给后续任务。
- TASK-040 的依赖已满足并已解锁为 `ready`；TASK-040 之前的续接、取消和恢复边界保持不变。
