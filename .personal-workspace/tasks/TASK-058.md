---
schema_version: 1
id: TASK-058
title: 实现 Idea Discovery Spec 阶段协调器
status: draft
goal_id: GOAL-012
role: executor
dependencies: [TASK-057, TASK-048]
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
target_branch: goal/GOAL-012
unblocked_by: TASK-057
---

# TASK-058：实现 Idea Discovery Spec 阶段协调器

## 目的与范围

通过现有 Agent Runtime 依次启动、取消、恢复和审核 Idea、Discovery、Spec 阶段，不依赖前一 Agent 会话。

## 验收条件

- 每次运行从正式状态和阶段任务包冷启动；
- 支持 start、resume、cancel、retry 和 state 查询；
- 阶段输出先校验再进入待审核，只有用户批准才进入下一阶段；
- 返工由原阶段角色处理，审核者保持只读；
- 中断、超时、非法输出、越界和清理失败均阻断推进并写审计；
- 同一时间只允许一个全局执行链。

## 验证

使用 Fake Adapter 覆盖成功、返工、中断、恢复和越权测试，并运行 `npm run verify`；真实 Adapter 验收由目标启动审批决定。

## 边界与交接

不生成开发计划，不自动批准阶段，不实现并行执行。完成后 TASK-059 可申请解锁。
