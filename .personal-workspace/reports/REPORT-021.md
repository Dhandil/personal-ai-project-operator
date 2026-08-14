---
schema_version: 1
id: REPORT-021
report_type: task_verification
task_id: TASK-020
goal_id: GOAL-005
status: accepted
revision: 1
verified_by: project_lead
verified_commit: 8259090
created_at: 2026-08-14T07:37:05Z
updated_at: 2026-08-14T07:37:05Z
---

# REPORT-021：TASK-020 独立验收报告

## 结论

TASK-020 的项目列表、单一当前项目选择和用户触发的每日启动流程符合任务卡要求，接受其 `completed` 状态。

## 实际成果

- 项目身份和当前选择来自中央 registry；实时状态、revision、hash、恢复状态和摘要从项目治理事实及 `status.md` 读取。
- 当前项目选择保持单一，切换时替换设置值，不复制动态状态到中央数据库。
- 每日启动明确由用户触发，永不自动启动工作；无当前项目时要求选择，有事实缺失/无效时要求恢复审查。
- 缺失或无效事实只返回结构化恢复提示，不自动重建、不自动写入、不自动启动。
- 列表、选择和启动均提供 API 路由。

## 独立验证

- `npm run test:integration -- project-startup`：34/34 通过，其中包含 4 项项目启动专项测试。
- 完整 `npm run verify`：44 个单元测试、34 个集成测试、2 个 Playwright Chromium 场景、类型检查、Lint、格式检查及全部构建均通过。
- `git diff --check`：通过。

## 边界核验

- 未发现中央数据库复制动态事实、自动启动、多个当前项目并存或恢复阶段隐式写入等阻塞缺陷。

## 下一步

TASK-021、TASK-022、TASK-023、TASK-024、TASK-026、TASK-028 的依赖均已满足，现已并行解锁；TASK-025、TASK-027 继续等待 TASK-023。
