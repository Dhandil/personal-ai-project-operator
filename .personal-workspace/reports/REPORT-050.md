---
schema_version: 1
document_type: report
id: REPORT-050
title: TASK-048 Claude Code CLI Adapter verification
status: in_review
report_type: task_verification
acceptance_state: pending
task_id: TASK-048
goal_id: GOAL-009
revision: 4
created_at: 2026-08-15T08:55:00Z
updated_at: 2026-08-15T12:45:00Z
verified_by: implementation_agent
verified_commit: dfd0992
verification_commands:
  - npm run test:claude-cli -- preflight
  - npm run test:claude-cli -- acceptance
  - npx tsx --test apps/server/test/claude-cli-preflight.integration.test.ts apps/server/test/claude-code-adapter.integration.test.ts
  - npm run verify
---

# REPORT-050: TASK-048 Claude Code CLI Adapter verification

## Defect-fix update

- The Adapter now explicitly passes `--model deepseek-v4-pro` (or the configured `CLAUDE_MODEL`) for start and resume. The selected model is recorded separately from authentication status and provider metadata.
- Preflight now reports `authenticationStatus`, `configuredModel`, provider metadata, and `canExecute` independently. `apiProvider: firstParty` is treated as authentication metadata and does not block execution; an empty model configuration does block execution.
- `unrecognized_model` is retained as a non-fatal structured/stderr diagnostic. Only non-zero process exit, malformed output, or failed capability checks block the Runtime result.
- Reviewer commands use `--tools Read` plus explicit denies for edit, write, notebook, Bash, and PowerShell, preventing a Windows shell-capable bypass. Executor commands include explicit non-interactive tool approval.
- Acceptance timeout is configurable with `CLAUDE_ACCEPTANCE_TIMEOUT_MS`; the default is 120 seconds and values below 90 seconds are rejected in favor of the default.

## User-provided manual compatibility evidence

The project lead supplied manual Claude Code + CC Switch + DeepSeek evidence for `--model deepseek-v4-pro`: ordinary JSON, stream JSON, JSON Schema structured output, `acceptEdits + Write`, `plan + disallowed-tools` with unchanged file hash, exact session resume, non-resumable `--no-session-persistence`, and `claude project purge`. The observed `unrecognized_model` message was non-fatal: the command exited successfully with the expected result. `apiProvider: firstParty` was correctly treated as Claude Code authentication metadata, not proof of the actual backend provider. This evidence is recorded as supplied manual evidence and is not self-acceptance by the implementation agent.

## Conclusion

The TASK-048 defect fix is implemented and submitted for independent review. Local contract, parser, preflight, lifecycle, cleanup, and full-project verification passed. The supplied manual evidence covers the real Claude Code + CC Switch + DeepSeek behavior. The final automatic acceptance used the configured model and a 90-second timeout, but the non-interactive request still did not return a final result; this report remains pending and does not claim self-acceptance.

## Implementation evidence

- Added `ClaudeCodeAdapter`, process spawning with an exact working directory, `claude -p` argument construction, JSON and stream-JSON parsing, execution/session metadata, cancellation, interruption, resume, and structured result mapping.
- Resume accepts a persisted execution ID, exact Claude session ID, and complete task start context, so a new runtime instance can issue `--resume` without relying on the old in-memory execution map.
- Executor and reviewer roles use separate permission modes and tool boundaries. Executor tools are explicitly available and approved as `Read,Edit,Write,Bash`; reviewer tools expose only `Read` and deny `Edit,Write,NotebookEdit,Bash,PowerShell` while using plan mode.
- Persistent cleanup is explicit and temporary-project-only through the official `claude project purge <path> --yes` command. Ephemeral execution uses `--no-session-persistence`. Cleanup failures are returned as structured retryable failures and do not discard the execution record.
- Added preflight checks for installation, authentication, JSON/stream-JSON, resume, session persistence, permission boundaries, JSON schema, and project purge. Authentication output is reduced to booleans and a provider classification; the installed CLI returned provider `unknown`, so the DeepSeek connection was not inferred.
- Added safe acceptance output that excludes credential contents and redacts token-shaped error text.

## Verification results

- Claude-specific integration tests: 9/9 passed.
- Full `npm run verify`: 70 unit tests, 122 integration tests, 15 Playwright tests, formatting, lint, typecheck, and all workspace builds passed.
- Preflight using Claude Code 2.1.233: installed `true`, authentication status `authenticated`, configured model `deepseek-v4-pro`, provider metadata `unknown`, all required command capability flags `true`, `canExecute: true`.

## Real temporary-project acceptance

- A dedicated temporary Git project was created under the operating system temporary directory. No real personal project was opened or changed.
- The acceptance attempted executor write, persistent cleanup, read-only reviewer execution, ephemeral cleanup, and exact session resume. No credential content or configuration values were read or logged.
- The final automatic acceptance used `CLAUDE_MODEL=deepseek-v4-pro` and `CLAUDE_ACCEPTANCE_TIMEOUT_MS=90000`. The executor request did not return a final result within the 90-second window and was cancelled. The safe result was `failed`, not `completed`; the expected file was absent and the following project-purge cleanup returned `cleanup_failed`.
- The safe automatic detail included `[claude-code:unrecognized_model]` for `deepseek-v4-pro`; the Adapter retained it as a non-fatal diagnostic. The blocking condition was the missing final result after the timeout, not that diagnostic.
- The local CLI did not expose a recognizable DeepSeek or Anthropic provider in `auth status --json`; the report records provider metadata as `unknown` and does not infer the actual backend from `apiProvider`.

## Scope confirmation

- Only TASK-048 implementation, its tests, package test registration, and TASK-048 verification records were changed.
- TASK-046 and REPORT-049 remain historical Codex CLI blocker records and were not rewritten.
- TASK-047 remains `draft`; no TASK-047 or GOAL-009 follow-up work was started.
- The temporary project and the local Node compatibility shim used for host verification were removed. No credential file was modified.

## Independent acceptance suggestion

1. In an approved environment where the existing Claude Code + DeepSeek request can complete, run `npm run test:claude-cli -- preflight` and confirm the output remains limited to safe status fields.
2. Run `npm run test:claude-cli -- acceptance` and confirm executor creation, reviewer read-only behavior, exact session resume, cancellation, and cleanup all complete in the dedicated temporary project.
3. Confirm the reported provider/connection mode explicitly; if the CLI continues to return `unknown`, keep DeepSeek compatibility unaccepted rather than inferring it.
4. After successful independent acceptance, update REPORT-050 to `accepted`, TASK-048 to `completed`, and only then decide whether TASK-047 may be unlocked. Until then, keep TASK-048 pending and TASK-047 unchanged.

## 独立复核结论

- 独立运行 Claude 专项回归测试 6/6，全部通过；这些测试不等同于真实 DeepSeek 请求成功。
- 独立复跑只读 preflight：Claude Code 2.1.227 已安装、已登录、能力探测通过，但 provider 仍为 `unknown`。
- 报告没有把 provider unknown 或超时结果伪装成 DeepSeek 兼容成功；真实验收阻断结论成立。
- REPORT-050 保持 `blocked`，TASK-048 不得标记为 `completed`，TASK-047 保持 `draft`。
