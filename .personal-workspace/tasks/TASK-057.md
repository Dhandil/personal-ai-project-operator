---
schema_version: 1
id: TASK-057
title: 实现阶段产物校验与批准写入
status: ready
goal_id: GOAL-012
role: executor
dependencies: [TASK-055, TASK-056]
revision: 2
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T15:20:00Z
target_branch: goal/GOAL-012
unblocked_by: TASK-056
---

# TASK-057：实现阶段产物校验与批准写入

## 目的与范围

在现有 Markdown/YAML 事实层上实现阶段产物读取、结构校验、候选变更、用户批准和原子写入。

## 验收条件

- Idea、Discovery、Spec 产物分别拥有明确 Schema、revision/hash 和阶段状态；
- Agent 输出先作为候选结果校验，未批准不覆盖正式已批准产物；
- 用户接受、要求修改或取消均形成审批与审计记录；
- 外部编辑冲突沿用现有三选一处理，不静默覆盖；
- 删除投影视图后可从正式阶段事实恢复。

## 验证

使用临时目录运行产物、冲突、批准和恢复集成测试，再运行 `npm run verify`。

## 边界与交接

不生成正式 GOAL/TASK，不运行阶段 Agent。完成后 TASK-058 可申请解锁。
