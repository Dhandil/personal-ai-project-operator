---
schema_version: 1
document_type: report
id: REPORT-050
title: TASK-048 Claude Code CLI Adapter verification
status: accepted
report_type: task_verification
acceptance_state: accepted
task_id: TASK-048
goal_id: GOAL-009
revision: 7
created_at: 2026-08-15T08:55:00Z
updated_at: 2026-08-15T13:56:29Z
verified_by: implementation_agent
verified_commit: b8caaba5ba71b2137851737c8514fcb5f5ce7efc
reviewed_by: project_lead
reviewed_at: 2026-08-15T13:56:29Z
accepted_by: project_lead
accepted_at: 2026-08-15T13:56:29Z
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
- A dedicated reviewer probe confirmed that Claude Code 2.1.233 emitted the first stdout line as a JSON array of event objects for `--output-format json --verbose --json-schema`. The parser now expands that envelope while strictly rejecting empty arrays and non-object members; it does not suppress malformed output.
- Reviewer acceptance now requires the expected structured fields and verifies that the reviewed file hash-equivalent content is unchanged.
- Resume acceptance waits for the precise session ID plus a progress event, allows the CLI to persist the conversation, cancels it, and resumes with a new Adapter instance. Missing session or persistence evidence is a failed case rather than a skipped case.

## User-provided manual compatibility evidence

The project lead supplied manual Claude Code + CC Switch + DeepSeek evidence for `--model deepseek-v4-pro`: ordinary JSON, stream JSON, JSON Schema structured output, `acceptEdits + Write`, `plan + disallowed-tools` with unchanged file hash, exact session resume, non-resumable `--no-session-persistence`, and `claude project purge`. The observed `unrecognized_model` message was non-fatal: the command exited successfully with the expected result. `apiProvider: firstParty` was correctly treated as Claude Code authentication metadata, not proof of the actual backend provider. This evidence is recorded as supplied manual evidence and is not self-acceptance by the implementation agent.

## Conclusion

The TASK-048 defect fix is implemented and independently accepted. Local parser, preflight, lifecycle, cleanup, full-project verification, and the real Claude Code + CC Switch + DeepSeek acceptance all passed. The implementation agent did not claim self-acceptance; acceptance was recorded after the independent rerun.

## Implementation evidence

- Added `ClaudeCodeAdapter`, process spawning with an exact working directory, `claude -p` argument construction, JSON and stream-JSON parsing, execution/session metadata, cancellation, interruption, resume, and structured result mapping.
- Resume accepts a persisted execution ID, exact Claude session ID, and complete task start context, so a new runtime instance can issue `--resume` without relying on the old in-memory execution map.
- Executor and reviewer roles use separate permission modes and tool boundaries. Executor tools are explicitly available and approved as `Read,Edit,Write,Bash`; reviewer tools expose only `Read` and deny `Edit,Write,NotebookEdit,Bash,PowerShell` while using plan mode.
- Persistent cleanup is explicit and temporary-project-only through the official `claude project purge <path> --yes` command. Ephemeral execution uses `--no-session-persistence`. Cleanup failures are returned as structured retryable failures and do not discard the execution record.
- Added preflight checks for installation, authentication, JSON/stream-JSON, resume, session persistence, permission boundaries, JSON schema, and project purge. Authentication output is reduced to booleans and a provider classification; the installed CLI returned provider `unknown`, so the DeepSeek connection was not inferred.
- Added safe acceptance output that excludes credential contents and redacts token-shaped error text.

## Verification results

- Claude-specific integration tests: 11/11 passed, including the observed JSON event-array envelope and malformed-member rejection.
- Full `npm run verify`: 70 unit tests, 124 integration tests, 15 Playwright tests, formatting, lint, typecheck, and all workspace builds passed.
- Preflight using Claude Code 2.1.233: installed `true`, authentication status `authenticated`, configured model `deepseek-v4-pro`, provider metadata `unknown`, all required command capability flags `true`, `canExecute: true`.

## Real temporary-project acceptance

- A dedicated temporary Git project was created under the operating system temporary directory. No real personal project was opened or changed.
- The first-line probe used the same reviewer flags and observed a top-level JSON array containing standard `system`, `assistant`, and `result` event objects. Only the safe envelope shape and known temporary-project output were inspected; no credential content was read or logged.
- The final automatic acceptance used configured model `deepseek-v4-pro` and `CLAUDE_ACCEPTANCE_TIMEOUT_MS=180000`. Its structured report returned `status: passed` and exit code 0.
- Complete case results: `executor: passed`, `persistentCleanup: passed`, `reviewer: passed`, `ephemeralCleanup: passed`, `resume: passed`, `resumeCleanup: passed`, and `temporaryProjectCleanup: passed`.
- The reviewer returned schema-conforming structured output while the file remained unchanged. Resume captured and persisted the exact session ID before cancellation, then resumed through a new Adapter instance. All child processes and event streams completed before temporary-directory removal.
- `[claude-code:unrecognized_model]` for `deepseek-v4-pro` remains a recorded non-fatal diagnostic when emitted; successful output and zero exit determine execution capability, while malformed output and non-zero exit remain blocking.
- The local CLI did not expose a recognizable DeepSeek or Anthropic provider in `auth status --json`; the report records provider metadata as `unknown` and does not infer the actual backend from `apiProvider`.

## Scope confirmation

- Only TASK-048 implementation, its tests, package test registration, and TASK-048 verification records were changed.
- TASK-046 and REPORT-049 remain historical Codex CLI blocker records and were not rewritten.
- TASK-047 remains `draft`; no TASK-047 or GOAL-009 follow-up work was started.
- The temporary project and the local Node compatibility shim used for host verification were removed. No credential file was modified.

## Independent acceptance record

1. Independent preflight confirmed Claude Code 2.1.233 remains authenticated, `deepseek-v4-pro` is configured, all capability flags are true, and `canExecute: true` without exposing credentials.
2. Independent acceptance confirmed all seven cases pass in the dedicated temporary project, including structured reviewer output and exact-session resume through a new Adapter instance.
3. The CLI continues to report provider metadata as `unknown`; this was retained as metadata and not used to infer native DeepSeek support.
4. REPORT-050 is accepted and TASK-048 is completed. TASK-047 remains `draft` until separately approved and started.

## 独立验收结论

- 当前专项回归测试为 11/11，完整 `npm run verify` 为 70 单元、124 集成、15 Playwright，全部通过。
- 当前 preflight 为 Claude Code 2.1.233，认证状态 `authenticated`，配置模型 `deepseek-v4-pro`，provider 元数据 `unknown`，`canExecute: true`。
- 独立运行 preflight 通过：Claude Code 2.1.233 已安装并认证，配置模型为 `deepseek-v4-pro`，`canExecute: true`。
- 独立运行真实 acceptance，退出码为 0，七个 case 全部 `passed`：executor、persistentCleanup、reviewer、ephemeralCleanup、resume、resumeCleanup、temporaryProjectCleanup。
- 审核者结构化输出符合 Schema 且保持文件不变；精确 session ID 由新 Adapter 实例成功续接；临时项目清理成功。
- `unrecognized_model` 仍作为非致命诊断记录，不影响成功结果。
- 因此正式接受 REPORT-050，并将 TASK-048 标记为 `completed`；TASK-047 继续保持 `draft`，未启动。
