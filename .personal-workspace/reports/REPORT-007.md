---
schema_version: 1
id: REPORT-007
report_type: task_verification
task_id: TASK-007
goal_id: GOAL-002
status: changes_requested
revision: 1
verified_by: project_lead
verified_commit: 7d9e38f4f6d5d19a3a24d1d299eca15d9327bf6c
created_at: 2026-08-14T02:00:36Z
updated_at: 2026-08-14T02:00:36Z
---

# REPORT-007：TASK-007 独立验收报告

## 结论

自动化质量检查全部通过，但 TASK-007 未通过语义验收，状态改为 `changes_requested`。本次不解锁 TASK-008，需修复后重新提交并复审。

## 已通过部分

- 目标、角色、任务卡和自定义字段模型已导出，指定测试通过。
- 目标审批门、角色与 Agent/CLI 解耦、任务草稿和自定义字段校验均有对应实现。
- `npm run verify`：通过；30 个单元测试、1 个集成测试、1 个 Playwright Chromium 测试及构建全部通过。
- `git diff --check`：通过。

## 阻塞问题

任务卡明确要求“必填字段不可删除”，并且 `Task` 的 `onDemandFiles` 与 `evidence` 都是必填字段。但当前 `updateTask` 未校验这两个字段：

```text
updateTask(task, { onDemandFiles: [] }) -> ok: true
updateTask(task, { evidence: [] }) -> ok: true
```

这意味着更新任务时可以把必填字段清空，违反 TASK-007 的验收条件。现有测试只覆盖更新标题，没有覆盖这两个字段的删除/清空路径。

## 修复要求

- 在 `updateTask` 的必填字段校验中补齐 `onDemandFiles` 和 `evidence`（以及保持其他必填字段的同等约束）。
- 增加回归测试，明确清空这两个字段必须返回 `invalid_task`。
- 修复后重新运行 `npm run test:unit -- goal role task` 和 `npm run verify`，再提交新的实现提交。

## 边界与后续

- 本次未修改实现代码，也未将 TASK-008 改为 `ready`。
- 修复完成并复审通过后，才能继续处理审批、问题、决策和交接模型。
