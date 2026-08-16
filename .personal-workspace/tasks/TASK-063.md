---
schema_version: 1
id: TASK-063
title: 实现项目经理冷启动与每日启动协调器
status: draft
goal_id: GOAL-013
role: executor
dependencies: [TASK-062]
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
target_branch: goal/GOAL-013
unblocked_by: TASK-062
---

# TASK-063：实现项目经理冷启动与每日启动协调器

## 目的与范围

让用户每天主动进入项目后，由全新项目经理 Agent 基于事实快照生成启动简报并执行已批准范围内的下一动作。

## 验收条件

- 冷启动任务包包含项目目标、当前获批目标、成果、任务/角色、风险、上一步、推荐下一步和用户操作；
- 项目经理不读取自身历史会话也能恢复；
- 每日启动由用户触发，不在后台自动选择项目；
- 可启动、取消、恢复项目经理运行并记录审计；
- 需要用户决定时停止自动执行并生成明确请求。

## 验证

使用 Fake Adapter 覆盖冷启动、恢复、等待用户和错误输出测试，再运行 `npm run verify`。

## 边界与交接

不实现 7×24 小时运行或多项目并发。完成后 TASK-064 可申请解锁。
