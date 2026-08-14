---
schema_version: 1
id: TASK-009
title: 实现状态转换审批门和完成判定策略
status: completed
goal_id: GOAL-002
role: executor
dependencies: [TASK-006, TASK-007, TASK-008]
revision: 3
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T02:34:18Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-008
---

# TASK-009：实现状态转换、审批门和完成判定策略

## 目的与范围

集中实现状态机、审批门、问题暂停和任务完成的确定性领域策略。

## 验收条件

- 所有非法状态转换均被拒绝；
- 未获批目标、未通过审核或证据不足不能完成；
- 问题只暂停确定受影响任务，范围未知时暂停执行链。

## 验证

`npm run test:unit -- policies`；检查关键分支覆盖率。

## 预计文件

`src/task-transition.ts`、`src/approval-policy.ts`、`src/completion-policy.ts`、`src/issue-impact-policy.ts`、对应测试。

## 边界与交接

不能把策略藏入 UI 或基础设施。完成后提交 GOAL-002 检查点。

## Completion

- Status: `completed`.
- Output: exported task transition, approval-gate, issue-impact, and completion-policy strategies from `@personal-ai-operator/domain`.
- State machine: enforces the Spec path `draft -> ready -> in_progress -> in_review -> completed`, control states, transition reasons, and transition audit results.
- Approval policy: requires accepted user approval for the fixed approval gates.
- Issue impact: pauses only identified affected tasks; unknown impact pauses the execution chain.
- Completion policy: requires an approved goal, accepted user approval, actual outputs, executed verification, evidence, Git diff reference, path verification, reviewer approval, and no open blocking issues.

## Verification evidence

- `npm run test:unit -- policies`: 5 tests passed.
- `npm run verify`: format check, lint, all workspace type checks, 40 unit tests, 1 integration test, 1 Playwright Chromium test, and all workspace builds passed.
- `git diff --check`: passed.

## Handoff

- TASK-010 was not implemented in this task.
