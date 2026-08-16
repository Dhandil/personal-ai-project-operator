---
schema_version: 1
id: TASK-061
title: 完成 V0.3 项目前期编排验收
status: draft
goal_id: GOAL-012
role: reviewer
dependencies: [TASK-055, TASK-056, TASK-057, TASK-058, TASK-059, TASK-060]
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
target_branch: goal/GOAL-012
unblocked_by: TASK-060
---

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
