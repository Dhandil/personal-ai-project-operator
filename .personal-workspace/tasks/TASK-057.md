---
schema_version: 1
id: TASK-057
title: 实现阶段产物校验与批准写入
status: completed
goal_id: GOAL-012
role: executor
dependencies: [TASK-055, TASK-056]
revision: 4
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-17T09:20:00Z
target_branch: goal/GOAL-012
unblocked_by: TASK-056
verification_report_id: REPORT-063
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

- 不生成正式 GOAL/TASK，不运行阶段 Agent。REPORT-063 已通过独立验收，TASK-058 已按依赖规则解锁。
## 完成证据

- 已实现 Idea、Discovery、Spec 和 planning 阶段产物的结构与 Schema 校验，校验通过后保留未知 YAML 字段。
- 候选产物、只读审核结果、用户批准记录和正式阶段事实分别存储；未获得用户批准时不会写入正式阶段事实。
- 接受、要求修改和取消均生成独立批准记录与审计事件；正式写入使用原子写入、revision/hash 冲突保护。
- 删除生成的 `status.md` 后，正式阶段事实仍可读取并用于恢复；外部修改正式事实时会阻止覆盖。
- 未启动真实 Agent，未修改 UI，未执行 TASK-058。

## 交接

实现提交：`f785927`。专项测试与完整 `npm run verify` 已通过，当前等待项目负责人独立验收 REPORT-063。
