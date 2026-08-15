---
schema_version: 1
id: TASK-046
title: 完成真实 Codex CLI Adapter 验收
status: blocked
goal_id: GOAL-009
role: reviewer
dependencies: [TASK-038, TASK-039, TASK-040, TASK-041, TASK-042, TASK-043, TASK-044, TASK-045]
revision: 4
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-15T07:45:00Z
approval_id: APPROVAL-004
target_branch: goal/GOAL-009
unblocked_by: TASK-045
verification_report_id: REPORT-049
---

# TASK-046：完成真实 Codex CLI Adapter 验收

## 目的与范围

在专用临时 Git 项目中验证本机真实 Codex CLI，而不是以模拟结果代替官方接口行为。

## 验收条件

- 实测安装/登录、JSONL、输出 Schema、cwd、写入和只读边界；
- 实测精确 session 续接、`--ephemeral` 和官方删除；
- 记录版本、沙箱模式、用量、失败和兼容性结论。

## 验证

用户知情后运行 `npm run test:codex-cli`；复核生成的验收报告。

## 预计文件

真实 CLI 测试入口、测试 Schema、临时项目夹具、验收报告生成器、测试。

## 边界与交接

可能消耗真实 Codex 用量；不得使用真实个人项目或读取凭据内容。发现不兼容先报告，不修改 Codex 内部文件。

## 解锁记录

- GOAL-009 已获 APPROVAL-004 批准。
- TASK-038 至 TASK-045 的全部依赖均已完成独立验收。
- TASK-046 已尝试执行，但因当前 Windows 环境无法启动真实 Codex CLI 而进入 `blocked`；未修改真实 Codex 环境。

## 独立复核

- 已独立复跑只读 preflight，结果仍为 `spawn EPERM`、`canExecute: false`。
- 相关预检与 Adapter 回归测试 19/19 通过，但未替代真实 CLI 验收。
- 阻断结论成立；在环境恢复前不得将 TASK-046 标记为 `completed`，也不得解锁 TASK-047。

## Attempt evidence

- Read-only preflight was run through `npm run test:codex-cli -- preflight`. It resolved the installed Windows AppX Codex executable but returned `installed: false`, `launchError: spawn EPERM`, `canExecute: false`, and no command or sandbox capabilities.
- A direct read-only `codex.exe --version` attempt at the resolved executable path returned `Access is denied`. No alternate executable was copied, installed, or modified.
- Because preflight did not authorize execution, no temporary project was created and no real `codex exec`, `exec resume`, `codex delete`, login, or configuration operation was attempted.
- No credential content was read or printed, and no real personal project was used.
- TASK-046 cannot satisfy the real execution acceptance conditions until the service process can start the approved Codex executable (or `CODEX_CLI_PATH` points to an accessible executable). The existing Adapter and prior simulated coverage were not treated as real CLI evidence.

## Handoff

- TASK-046 remains blocked pending a Windows process-permission or approved executable-path change outside this task; after that environment change, rerun the real temporary-project acceptance.
- TASK-047 remains locked and was not executed.
