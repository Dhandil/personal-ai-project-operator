---
schema_version: 1
id: TASK-034
title: 实现规范提交目标分支合并和主分支审批门
status: draft
goal_id: GOAL-007
role: executor
dependencies: [TASK-027, TASK-032, TASK-033]
revision: 1
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T12:29:07Z
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
