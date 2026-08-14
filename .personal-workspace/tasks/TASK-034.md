---
schema_version: 1
id: TASK-034
title: 实现规范提交目标分支合并和主分支审批门
status: changes_requested
goal_id: GOAL-007
role: executor
dependencies: [TASK-027, TASK-032, TASK-033]
revision: 4
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T15:10:42Z
approval_id: APPROVAL-002
target_branch: goal/GOAL-007
unblocked_by: TASK-033
verification_report_id: REPORT-036
---

# TASK-034：实现规范提交、目标分支合并和主分支审批门

## 目的与范围

生成统一 Commit、将验收任务合入目标分支，并在用户批准后才把目标合入 `main`。

## 验收条件

- Commit 标题、语言设置和 `Tasks:` 正文符合 Spec；
- 未验收任务不能 Commit 或 Merge；
- 没有有效用户审批时拒绝合入 `main`。

## 验证

`npm run test:integration -- git-delivery`，使用临时仓库检查提交图。

## 预计文件

Commit 消息服务、任务交付服务、目标 Merge 服务、审批校验 Adapter、集成测试。

## 边界与交接

禁止 force、历史重写和远程 push。完成后提交 GOAL-007 检查点。

## 完成证据

- 新增 Commit 消息服务，生成 `<type>(<scope>): <description>` 标题，并固定写入 `Tasks: TASK-034` 正文；type/scope 强制使用英文小写 token。
- 新增任务交付服务：未验收任务拒绝 Commit 和 task→goal 合并；已验收任务只在任务分支提交，并使用非 force 的本地合并进入目标分支。
- 新增目标合并服务和审批 Adapter：只有当前、未过期且由用户批准的 `main_merge` 审批才能将 `goal/GOAL-xxx` 合入 `main`；无审批、拒绝或过期审批均不写入 Git。
- 全部 Git 操作不执行 force、历史重写、远程 push 或直接绕过任务分支；测试仅使用临时仓库。
- TASK-034 专项测试 4/4、完整集成测试 69/69、单元测试 64/64、Chromium Playwright 14/14，以及格式、Lint、类型检查和构建全部通过。

## 交接

- [REPORT-036](../reports/REPORT-036.md) 独立复核发现合并提交正文硬编码 TASK-034，状态为 `changes_requested`。
- 修复前不得将 TASK-034 视为已接受，也不得进入依赖它的后续任务。
