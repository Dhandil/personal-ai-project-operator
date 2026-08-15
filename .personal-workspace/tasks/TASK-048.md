---
schema_version: 1
id: TASK-048
title: 实现 Claude Code CLI Adapter
status: blocked
goal_id: GOAL-009
role: executor
dependencies: [TASK-035, TASK-036, TASK-037, TASK-043, TASK-044, TASK-045]
revision: 3
created_at: 2026-08-15T08:04:00Z
updated_at: 2026-08-15T09:29:18Z
approval_id: APPROVAL-004
target_branch: goal/GOAL-009
unblocked_by: TASK-045
verification_report_id: REPORT-050
---

## Completion evidence

- Added a Claude Code process adapter with non-interactive `claude -p` execution, JSON and stream-JSON parsing, exact execution/session tracking, resume, cancellation, interruption, structured failures, and bounded cleanup.
- Executor and reviewer roles receive distinct permission modes and tool boundaries. Reviewer mode denies editing, writing, notebook editing, and shell tools; the working directory and task context remain explicit in command and result metadata.
- Persistent sessions use the official project purge command only when explicitly enabled for a temporary project. Ephemeral sessions use `--no-session-persistence`. Cleanup failures remain structured and retryable without dropping the execution record.
- Added preflight checks for installation, authentication, JSON/stream-JSON, resume, session persistence, permission boundaries, JSON schema, and project purge. Authentication output is reduced to safe status fields; the local CLI did not expose a recognizable provider, so provider is recorded as `unknown`.
- Added 6 Claude-specific integration tests covering preflight, executor/reviewer boundaries, JSON/stream-JSON, new-runtime resume, ephemeral persistence, and project cleanup.
- Full `npm run verify` passed: 70 unit tests, 119 integration tests, 15 Playwright tests, formatting, lint, typecheck, and all builds.
- Real CLI acceptance was attempted only in a dedicated temporary Git project. Claude Code 2.1.227 was found and authenticated, but the request did not complete within the 30-second bounded execution window; cancellation and cleanup were then attempted. This remains an environment-blocked acceptance result, not a success claim.

## Handoff

- TASK-048 is `in_review` and awaits independent acceptance of REPORT-050.
- TASK-047 remains `draft` and was not executed or modified. GOAL-009 was not advanced by this task.
- TASK-046 and REPORT-049 remain historical Codex CLI blocker records and were not rewritten.

## 独立复核

- Claude Code 2.1.227 的 preflight 独立复跑通过安装、登录和命令能力检查，但 provider 为 `unknown`。
- Claude 专项回归测试 6/6 通过；真实 provider 请求仍无法在限定时间内完成，因此 TASK-048 保持 `blocked`。
- TASK-047 继续保持 `draft`，未执行或解锁。

# TASK-048：实现 Claude Code CLI Adapter

## 目的与范围

基于用户现有的 Claude Code CLI + DeepSeek 配置，实现并验证一个接入既有 Runtime contracts 的厂商适配器，使工作台可以在不依赖 Codex CLI 的情况下执行、审核、恢复和清理任务。

## 验收条件

- 通过 Claude Code 非交互入口执行任务，并解析稳定的 JSON 或流式 JSON 输出；
- 精确记录执行 ID、Claude session ID、工作目录、角色和任务快照，并支持按 session ID 续接；
- 执行者与只读审核者使用不同任务包和工具边界，审核者不能写入正式项目文件；
- 支持取消、中断、失败、非法输出、越权和清理失败的统一 Runtime 结果；
- 仅在专用临时 Git 项目中进行真实 CLI 验证，不读取凭据内容，不使用真实个人项目；
- 记录 Claude Code 版本、DeepSeek 连接方式、输出兼容性、用量/失败和限制，不把 DeepSeek 的非标准行为伪装成 Claude 原生能力。

## 建议接口能力

- 非交互执行：`claude -p`；
- 输出：优先 `--output-format stream-json`，必要时兼容 `json`；
- 续接：使用精确 session ID；
- 权限：通过允许/禁止工具和工作目录边界落实执行者/审核者差异；
- 所有真实 CLI 能力先经过 preflight，失败时不得创建临时项目或启动执行。

## 验证

在用户知情和批准的专用临时项目中运行 Claude Code Adapter 专项测试，再运行完整 `npm run verify`；生成独立验收报告，等待复核后才可解锁 TASK-047。

## 边界与交接

- 不修改 Claude Code 或 DeepSeek 的凭据、配置和安装文件；
- 不把 TASK-046 的 Codex 阻断结论改写为成功；
- 发现 DeepSeek 兼容性限制时记录为兼容性结论，并通过 Runtime 的结构化失败结果暴露；
- 完成后更新任务卡、生成报告并提交规范治理记录。
