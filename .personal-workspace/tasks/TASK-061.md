---
schema_version: 1
id: TASK-061
title: 完成 V0.3 项目前期编排验收
status: completed
goal_id: GOAL-012
role: reviewer
dependencies: [TASK-055, TASK-056, TASK-057, TASK-058, TASK-059, TASK-060]
revision: 4
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-17T14:20:00Z
target_branch: goal/GOAL-012
unblocked_by: TASK-060
---

## Implementation evidence

- Added a temporary-project V0.3 composite acceptance test covering Idea, Discovery, Spec, planning-draft editing, user approval, formal goal/task creation, and first-task `ready` handoff.
- The composite test verifies that formal goals and tasks do not exist before approval, the three stages require explicit approval in order, and approval creates only the first dependency-free task as `ready`.
- Reused the existing governed stage coordinator, planning-draft approval path, shared execution lock, revision/hash checks, and recovery/rework tests; no production business semantics were changed.
- Implementation commit: `b67efa0`.

## Verification evidence

- V0.3 composite temporary-project integration test plus stage/planning regressions: 13/13 passed.
- Planning console Chromium scenario: 1/1 passed.
- Real Claude temporary-project acceptance: 7/7 cases passed with Claude Code 2.1.233 and configured model `deepseek-v4-pro`; no personal project was used.
- Full `npm run verify`: 107 unit tests, 143 integration tests, and 23 Chromium tests passed; formatting, lint, type checks, and all builds passed.

## Handoff

- TASK-061 is `in_review`; REPORT-067 and GOAL-012 checkpoint REPORT-068 remain `pending_acceptance`.
- No real project was accessed, no GOAL-013 was started, and no later task was executed.

# TASK-061：完成 V0.3 项目前期编排验收

## 目的与范围

在临时项目中验证从一个想法到首个正式 `ready` 任务的完整前期流程。

## 验收条件

- 覆盖 Idea、Discovery、Spec、规划草案、用户退回/批准和正式写入；
- 验证新阶段 Agent 不读取前序聊天历史；
- 覆盖中断恢复、审核返工、越权写入、非法规划和批准失败；
- 正式目标和任务只在用户批准后出现；
- 批准后首个任务可进入现有执行控制台；
- 生成 V0.3 检查点报告并由用户验收。

## 验证

运行 V0.3 专项 E2E、完整 `npm run verify`，以及目标启动审批指定的真实 Adapter 临时项目验收。

## 边界与交接

不得使用真实个人项目，不得自行接受检查点或启动 GOAL-013。

## 独立验收

- REPORT-067 已由项目负责人独立验收并标记为 `accepted`。
- V0.3 组合专项 13/13、规划控制台 Chromium 1/1、Claude Code + DeepSeek 临时项目 7/7 通过。
- 完整 `npm run verify`：107 单元、143 集成、23 Chromium，以及质量检查和构建全部通过。
- TASK-061 已完成；GOAL-012 检查点 REPORT-068 仍需单独验收。
