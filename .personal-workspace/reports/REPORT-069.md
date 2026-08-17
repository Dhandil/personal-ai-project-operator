---
schema_version: 1
document_type: report
id: REPORT-069
title: TASK-085 Claude Runtime Web production startup integration
status: pending_acceptance
report_type: task_acceptance
acceptance_state: pending_acceptance
task_id: TASK-085
goal_id: GOAL-016
revision: 1
created_at: 2026-08-17T09:20:00Z
updated_at: 2026-08-17T09:20:00Z
verified_by: implementation_agent
verified_commit: f517ede
verification_commands:
  - npm exec --workspace apps/server -- tsx --test test/claude-runtime-service.integration.test.ts
  - npm run test:e2e -- e2e/claude-runtime-diagnostics.spec.ts
  - npm run test:claude-cli -- preflight
  - npm run test:claude-cli -- acceptance
  - npm run verify
---

# REPORT-069: TASK-085 Claude Runtime 接入 Web 生产启动链

## 实现范围

- 生产入口创建并共享一个 Claude Runtime，普通任务执行与 Idea、Discovery、Spec 阶段执行使用同一真实 Runtime。
- Runtime 统一传递受控 CLI 路径、`deepseek-v4-pro` 模型和默认不少于 90 秒的超时；执行和续接前执行预检，预检失败不启动 Agent。
- Web 提供只读 Claude Runtime 预检/能力诊断 API，系统页展示认证、配置模型、执行能力、工具边界、JSON/流式 JSON、resume、临时会话和 purge 能力摘要。
- 诊断和错误信息不输出凭据、令牌或认证原文；未改变审批门、只读审核和 Git 安全边界。

## 自动化验证

- Runtime 专项测试：3/3 通过。
- Chromium 系统诊断场景：1/1 通过。
- 完整 `npm run verify`：107 单元、148 集成、24 Chromium 全部通过，格式、Lint、类型检查和构建通过。

## 真实临时项目验收

使用 Claude Code 2.1.233 + DeepSeek `deepseek-v4-pro`，仅创建并清理临时 Git 项目；未读取凭据内容，未访问真实个人项目，未执行真实项目 `main` 合并。

Acceptance report：

- `executor`: `passed` — non-interactive write and structured result
- `persistentCleanup`: `passed` — temporary project purge completed
- `reviewer`: `passed` — structured read-only review preserved the file
- `ephemeralCleanup`: `passed` — no persisted session purge required
- `resume`: `passed` — exact session resumed
- `resumeCleanup`: `passed` — resumed temporary session cleaned
- `temporaryProjectCleanup`: `passed` — removed after 1 attempt

Preflight：installed，version `2.1.233`，authentication `authenticated`，configured model `deepseek-v4-pro`，`canExecute: true`；provider 保持 `unknown`，不以 Claude Code 的 first-party 认证元数据误判实际后端。

## 独立验收

本报告由实现者生成，状态保持 `pending_acceptance`，未由实现者标记为 `accepted`。建议验收时复跑预检、真实临时项目 acceptance、Runtime 专项和完整 `npm run verify`，并确认生产入口未默认创建 FakeAgentAdapter、未写入任何凭据且没有 main 合并副作用。
