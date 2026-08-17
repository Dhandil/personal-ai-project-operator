---
schema_version: 1
document_type: report
id: REPORT-064
title: TASK-058 Idea Discovery Spec 阶段协调器实现验收报告
status: pending_acceptance
report_type: task_verification
acceptance_state: pending
task_id: TASK-058
goal_id: GOAL-012
revision: 1
created_at: 2026-08-17T09:45:00Z
updated_at: 2026-08-17T09:45:00Z
verified_by: implementation_agent
verified_commit: eef7363
verification_commands:
  - npx tsx --test apps/server/test/stage-coordinator.integration.test.ts
  - npm run verify
---

# REPORT-064：TASK-058 Idea、Discovery、Spec 阶段协调器

## 实现结果

- 新增阶段协调器，按 Idea → Discovery → Spec 的确定性顺序启动，并从正式项目事实、持久化 stage run 和现有角色任务包重建每次运行上下文。
- 阶段运行支持 start、state、cancel、resume、retry；同一项目使用全局执行链锁，运行中的执行、恢复中的执行和待审批阶段不会被并行推进。
- Agent 候选产物先经过现有阶段 Schema 校验，再写入候选目录并启动只读审核；审核结果写入独立记录，只有用户明确批准才调用现有批准门写入正式阶段事实并允许下一阶段启动。
- 阶段交接携带已批准产物引用；返工继续使用原阶段角色，审核者使用只读任务包、空允许写入路径和禁止写入 formal facts 的边界。
- 中断保留精确 execution/session 上下文以供恢复；非法输出、运行失败、权限异常和清理失败会阻断推进、保存恢复信息并写入审计事件。

## 验证结果

- TASK-058 专项集成测试：4/4 通过，覆盖三阶段顺序与审批门、批准产物交接、返工、非法输出阻塞、精确 session 恢复和 cleanup failure。
- 完整 `npm run verify` 通过：97 个单元测试、133 个集成测试、22 个 Chromium Playwright 测试，以及格式、Lint、类型检查和 contracts/domain/server/web 构建。
- 未启动真实 Agent，未修改 UI，未生成正式 GOAL/TASK，也未执行 TASK-059 或其他后续任务。

## 独立验收建议

1. 重跑专项测试和完整 `npm run verify`。
2. 检查未批准时只有 stage-candidates、stage-reviews 和 stage-runs 变化，正式 Idea/Discovery/Spec 文件保持不变。
3. 逐阶段批准 Idea、Discovery、Spec，确认只有用户批准后才允许下一阶段，并检查已批准产物引用不重复。
4. 验证 changes_requested 使用原阶段角色返工；验证中断恢复使用持久化 executionId 和精确 sessionId；验证非法输出和 cleanup failure 均保持 blocked 且可恢复。
5. 确认 TASK-059 未被执行或修改。验收通过后由项目负责人将本报告标记为 `accepted`，再按治理依赖决定是否解锁 TASK-059。

## 状态声明

本报告保持 `pending_acceptance`；实现者未将报告标记为 `accepted`。TASK-058 保持 `in_review`。
