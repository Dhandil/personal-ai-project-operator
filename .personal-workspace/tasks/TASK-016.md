---
schema_version: 1
id: TASK-016
title: 实现 Git 仓库检测初始化和基线提交能力
status: completed
goal_id: GOAL-004
role: executor
dependencies: [TASK-004]
revision: 3
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T05:54:37Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-014
---

# TASK-016：实现 Git 仓库检测、初始化和基线提交能力

## 目的与范围

提供只读检测、受控初始化和首次治理基线提交，不实现任务 Worktree。

## 验收条件

- 正确区分无仓库、已有仓库和异常仓库；
- 未批准时不执行写操作；
- 基线 Commit 遵循统一格式且不改写已有历史。

## 验证

`npm run test:integration -- git-bootstrap`，使用临时仓库。

## 预计文件

Git 进程端口、Git Bootstrap Adapter、提交消息策略、集成测试和夹具。

## 边界与交接

禁止 force、reset、历史重写或远程操作。完成后交给 TASK-017、018。

## Completion

- Status: `completed`.
- Output: added a structured Git process port, repository detection, approval-gated initialization, baseline commit policy, and `git-bootstrap` integration coverage.
- Detection: distinguishes no repository, valid existing repository, and invalid `.git` state without replacing or repairing an abnormal repository.
- Approval safety: unapproved bootstrap performs no Git write; approved initialization creates a local repository only and never contacts a remote.
- Baseline safety: only `.personal-workspace` is staged for the baseline; commit messages use `chore(governance): initialize project baseline` with `Tasks: TASK-016`, and repeated bootstrap does not rewrite history.
- Boundary: no force, reset, history rewrite, Worktree, or remote operation was added.

## Verification evidence

- `npm run test:integration -- git-bootstrap`: 23 integration tests passed, including 3 Git bootstrap tests.
- `npm run verify`: format check, lint, all workspace type checks, 40 unit tests, 23 integration tests, 1 Playwright Chromium test, and all workspace builds passed.
- `git diff --check`: passed.

## Handoff

- TASK-017 and TASK-018 were not implemented in this task.
