---
schema_version: 1
document_type: report
id: REPORT-063
title: TASK-057 阶段产物校验与批准写入验收报告
status: pending_acceptance
report_type: task_verification
acceptance_state: pending_acceptance
task_id: TASK-057
goal_id: GOAL-012
revision: 1
created_at: 2026-08-17T00:57:08Z
updated_at: 2026-08-17T00:57:08Z
verified_by: implementation_agent
verified_commit: f785927
verification_commands:
  - npx vitest run packages/domain/src/stage-artifact.test.ts packages/domain/src/stage-task-package.test.ts packages/domain/src/stage-run.test.ts --config vitest.config.ts
  - npx tsx --test apps/server/test/stage-artifact.integration.test.ts
  - npm run verify
---

# REPORT-063：TASK-057 阶段产物校验与批准写入

## 结论

TASK-057 已完成实现和自验证，本报告保持 `pending_acceptance`，等待项目负责人独立验收。实现者未将本报告标记为 `accepted`。

## 实现证据

- 为 Idea、Discovery、Spec 和 planning 阶段定义明确的产物 kind、stage、schemaVersion 与必填字段 Schema；未知 YAML 字段在候选和正式写入中保留。
- 候选产物写入 `.personal-workspace/stage-candidates/`，审核结果写入 `.personal-workspace/stage-reviews/`，用户决定写入 `.personal-workspace/stage-approvals/`，正式批准事实才写入对应阶段事实文件。
- `accepted` 审核后仍必须经过用户批准；`changes_requested` 和 `cancelled` 只记录决定、审计和恢复上下文，不覆盖正式阶段事实。
- 所有候选、审核、批准和正式事实写入均经过 revision/hash 快照校验、项目级写入队列和原子文件写入；外部正式事实变化会返回冲突并拒绝覆盖。
- 批准、要求修改和取消均写入结构化审计事件；删除 `status.md` 不影响正式阶段事实读取与恢复。

## 验证结果

- 阶段产物专项领域测试：19/19 通过。
- 阶段产物专项集成测试：4/4 通过。
- 完整 `npm run verify`：97 个单元测试、129 个集成测试、22 个 Playwright 测试通过；格式、Lint、类型检查和 contracts/domain/server/web 构建全部通过。

## 范围确认

- 未启动真实 Agent。
- 未修改 UI、审批页面、执行流程或后续任务事实。
- TASK-058 保持 `draft`，未执行或解锁。

## 独立验收建议

1. 检查候选、审核、批准和正式阶段文件是否分离，并确认未批准路径不改变正式阶段事实。
2. 复跑两组专项测试和 `npm run verify`，核对 revision/hash 冲突与未知 YAML 字段保留。
3. 验收通过后，由项目负责人将 REPORT-063 标记为 `accepted`，再按治理依赖决定 TASK-058 是否解锁。
