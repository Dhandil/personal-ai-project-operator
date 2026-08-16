---
schema_version: 1
id: TASK-059
title: 从 Spec 生成目标角色与任务草案
status: draft
goal_id: GOAL-012
role: executor
dependencies: [TASK-057, TASK-058]
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
target_branch: goal/GOAL-012
unblocked_by: TASK-058
---

# TASK-059：从 Spec 生成目标角色与任务草案

## 目的与范围

让规划 Agent 读取已批准 Spec，生成可校验、可编辑但尚不可执行的目标、角色和任务卡草案。

## 验收条件

- 草案包含目标、角色、任务、依赖、验收条件、必读/按需文件、允许路径和验证命令；
- ID、依赖缺失、重复、循环、越界路径和未知角色会被拒绝；
- 草案与正式事实分离，重新生成不会覆盖用户编辑；
- 用户可逐项修改后统一批准或退回；
- 批准写入使用原子事务语义，部分失败返回恢复计划；
- 只有批准成功后第一个无依赖任务才可转为 `ready`。

## 验证

运行草案 Schema、依赖图、批准原子性和恢复集成测试，再运行 `npm run verify`。

## 边界与交接

规划 Agent 只能建议，不得自行批准、启动目标或执行任务。完成后 TASK-060 可申请解锁。
