---
schema_version: 1
id: TASK-055
title: 定义前期阶段运行与审批状态模型
status: draft
goal_id: GOAL-012
role: executor
dependencies: [TASK-054]
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
target_branch: goal/GOAL-012
unblocked_by: GOAL-011
---

# TASK-055：定义前期阶段运行与审批状态模型

## 目的与范围

为 Idea、Discovery、Spec 和规划阶段定义独立于文件存在状态的运行、审核、批准、返工和恢复状态模型。

## 验收条件

- 定义阶段运行 ID、阶段状态、当前责任角色、产物引用和审批引用；
- 状态转换覆盖待开始、执行中、待审核、返工、已批准、阻塞、取消和恢复；
- 文件已存在不能自动代表阶段完成或批准；
- 未批准阶段不能推进下一阶段，失败或中断不能误推进；
- 策略位于领域层并提供非法转换测试。

## 验证

运行阶段领域专项测试和完整 `npm run verify`。

## 边界与交接

不启动真实 Agent、不修改 UI、不自动批准阶段。完成后 TASK-056 可申请解锁。
