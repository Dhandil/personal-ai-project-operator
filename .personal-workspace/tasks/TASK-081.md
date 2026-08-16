---
schema_version: 1
id: TASK-081
title: 实现 API Agent 受控文件与命令工具网关
status: draft
goal_id: GOAL-015
role: implementer
dependencies: [TASK-077, TASK-080]
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
target_branch: goal/GOAL-015
unblocked_by: TASK-080
---

# TASK-081：实现 API Agent 受控文件与命令工具网关

## 目的与范围

让 API Agent 通过工作台控制的工具网关读取和修改任务 Worktree，而不是让模型直接编辑文件。

## 验收条件

- 所有文件路径必须位于分配的 Worktree 与允许路径内；
- 读、写、补丁、列目录和允许命令分别声明能力；
- 禁止远程 Git、force、reset、历史改写、越界路径和未批准命令；
- 每次调用记录参数摘要、结果、失败和越权审计，敏感信息脱敏；
- 写入后继续执行差异、允许路径、测试和成果校验；
- 只读审核角色不能获得写入或命令能力。

## 验证

覆盖合法编辑、路径逃逸、符号链接、禁止命令、审核越权和恢复测试。

## 边界与交接

不得暴露任意宿主 Shell；命令必须来自项目或 Adapter 的显式允许列表。
