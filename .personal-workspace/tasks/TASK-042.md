---
schema_version: 1
id: TASK-042
title: 实现执行成果差异测试和证据校验
status: ready
goal_id: GOAL-009
role: executor
dependencies: [TASK-033, TASK-036, TASK-039]
revision: 2
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-15T04:20:22Z
approval_id: APPROVAL-004
target_branch: goal/GOAL-009
unblocked_by: GOAL-008
---

# TASK-042：实现执行成果、差异、测试和证据校验

## 目的与范围

把 Agent 结果与实际文件、Git 差异、允许路径、验证命令和证据进行确定性比对。

## 验收条件

- Agent 自称完成不能直接改变任务状态；
- 缺少产物、失败测试、越界变化或证据不足均拒绝验收；
- 校验结果可供审核、报告和审计复用。

## 验证

`npm run test:integration -- task-result-validation`，覆盖全部拒绝原因。

## 预计文件

成果采集器、验证执行器、完成证据服务、结果验证用例、集成测试。

## 边界与交接

验证命令只能来自获批任务卡。完成后交给 TASK-043、044。
