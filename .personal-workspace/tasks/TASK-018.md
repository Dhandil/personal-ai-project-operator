---
schema_version: 1
id: TASK-018
title: 实现用户批准后的项目创建
status: ready
goal_id: GOAL-004
role: executor
dependencies: [TASK-017]
revision: 2
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T06:34:22Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-017
---

# TASK-018：实现用户批准后的项目创建

## 目的与范围

使用仍然有效的预览和明确批准，一次性创建治理文件、登记项目并完成 Git 基线提交。

## 验收条件

- 预览过期或目录变化时拒绝执行并要求重新预览；
- 成功创建后项目文件、索引和 Git 一致；
- 中途失败留下可理解的恢复或清理报告。

## 验证

`npm run test:integration -- project-initialization`。

## 预计文件

项目创建用例、批准契约、初始化事务协调器、API Route、集成测试。

## 边界与交接

不得将未批准默认值静默加入项目。完成后交给 TASK-019、020。
