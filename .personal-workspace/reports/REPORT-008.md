---
schema_version: 1
id: REPORT-008
report_type: task_verification
task_id: TASK-007
goal_id: GOAL-002
status: accepted
revision: 1
verified_by: project_lead
verified_commit: a00cd79e0d53f3f77dd0cbd126a88ca3564e0ea1
created_at: 2026-08-14T02:09:58Z
updated_at: 2026-08-14T02:09:58Z
---

# REPORT-008：TASK-007 修复复审验收报告

## 结论

REPORT-007 中提出的必填字段清空问题已修复并通过复审。TASK-007 恢复为 `completed`，并解锁 TASK-008；TASK-009 仍等待 TASK-008，本次未执行。

## 修复核验

- `updateTask` 现在对 `scope`、`outputs`、`acceptanceCriteria`、`requiredFiles`、`onDemandFiles`、`allowedPaths`、`forbiddenPaths`、`evidence` 等必填列表统一执行非空内容校验。
- 新增回归测试覆盖清空 `onDemandFiles` 和 `evidence` 的路径，均返回 `invalid_task`。
- 独立复测结果：

```text
updateTask(task, { onDemandFiles: [] }) -> ok: false
updateTask(task, { evidence: [] }) -> ok: false
```

## 独立验证

- `npm run test:unit -- goal role task`：通过，3 个测试文件、9 个测试通过。
- `npm run typecheck`、`npm run lint`、`npm run format:check`：均通过。
- 全量 `npm run verify`：通过。
  - Vitest：9 个测试文件、31 个测试通过。
  - server 集成测试：1 个测试通过。
  - Playwright Chromium：1 个端到端测试通过。
  - contracts/domain/server/web 构建：均通过。
- `git diff --check`：通过；生成物和临时服务清理后工作区保持干净。

## 边界核验

- 修复仅涉及任务卡必填字段校验和对应回归测试，未扩大到 TASK-008 或 TASK-009。
- 目标审批门、角色与 Agent/CLI 解耦、自定义字段模型和任务依赖模型保持有效。

## 下一步

TASK-008 已满足依赖条件，可开始实现审批、问题、决策和交接记录模型。TASK-009 仍须等待 TASK-008 完成。
