---
schema_version: 1
id: TASK-055
title: 定义前期阶段运行与审批状态模型
status: in_review
goal_id: GOAL-012
role: executor
dependencies: [TASK-054]
revision: 3
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:43:27Z
target_branch: goal/GOAL-012
unblocked_by: GOAL-011
verification_report_id: REPORT-061
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

- 阶段运行模型已完成，当前状态为 `in_review`；REPORT-061 等待项目负责人独立验收。
- 不启动真实 Agent、不修改 UI、不自动批准阶段，也未执行 TASK-056 或其他后续任务。
- 独立验收通过后，TASK-056 才可申请解锁。

## 完成证据

- 实现提交：`c34c9079cd51e820349f4ff305aa9c425eea14eb`。
- 阶段运行记录包含独立运行 ID、阶段键、当前责任角色、产物引用、审批引用、尝试次数和状态原因；文件存在不会自动改变运行状态。
- 状态转换覆盖 `pending`、`running`、`awaiting_review`、`changes_requested`、`approved`、`blocked`、`cancelled` 和 `recovering`。
- 领域专项测试：7/7 通过；覆盖显式用户批准、返工、阻塞、取消、恢复、文件存在与状态分离及非法转换。
- 完整 `npm run verify`：85 个单元测试、129 个集成测试、22 个 Playwright 测试，以及格式、Lint、类型检查和 contracts/domain/server/web 构建全部通过。
