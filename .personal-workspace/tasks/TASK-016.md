---
schema_version: 1
id: TASK-016
title: 实现 Git 仓库检测初始化和基线提交能力
status: draft
goal_id: GOAL-004
role: executor
dependencies: [TASK-004]
revision: 1
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T12:29:07Z
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
