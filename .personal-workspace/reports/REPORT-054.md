---
schema_version: 1
document_type: report
id: REPORT-054
title: TASK-050 工作流使用引导验收报告
status: pending_acceptance
report_type: task_verification
acceptance_state: pending
task_id: TASK-050
goal_id: GOAL-010
revision: 1
created_at: 2026-08-16T07:42:24Z
updated_at: 2026-08-16T07:42:24Z
verified_by: implementation_agent
verified_commit: 32220e0ef16e530cd77bea56d796ccf48d9e93d0
verification_commands:
  - npx vitest run --config apps/web/vitest.config.ts apps/web/src/workflow.test.ts
  - npx tsx --test apps/server/test/workflow.integration.test.ts
  - npx playwright test e2e/workflow.spec.ts --config=playwright.config.ts
  - npm run verify
---

# REPORT-054：TASK-050 工作流使用引导验收报告

## 结论

TASK-050 已完成实现和验证，提交独立验收。工作流页面现在解释首次使用路径、阶段文件责任、阶段状态与文件状态的区别，并为当前阶段提供可执行的读取与下一步建议；跳过流程仍保留 Agent 建议和用户理由审批门。

## 实现证据

- 首次使用引导明确：系统创建治理文件和默认流程，Agent 读取正式材料并在获准边界内更新，用户审批目标、范围和跳过建议；用户无需上传阶段文件。
- 每个阶段同时展示阶段状态和文件状态。独立文件已存在显示“系统已创建”，独立文件缺失显示“无需上传”；没有独立文件的用户场景、Discovery 验证等阶段显示“使用共用正式材料”。
- 当前阶段引导包含首要操作、需要读取的产物、推荐下一步和相关入口；工作流路径提供项目总览 → 工作流 → 执行控制台。
- 后端产物映射修正为三个正式阶段文件：`01-idea/01-idea.md`、`02-discovery/02-discovery.md`、`03-spec/03-spec.md`。用户场景、Discovery 验证及后续 Spec 内流程段不再重复返回同一个文件作为独立产物。
- 跳过建议和用户决定 API 未改变：Agent 只能提出建议，用户决定必须提供理由并由事实层记录。

## 验证结果

- 前端工作流专项测试：3/3 通过，覆盖严格工作流响应解析、跳过建议/决定分离、十阶段引导和执行入口。
- 后端工作流集成测试：3/3 通过，覆盖有序阶段、三个正式文件映射、共用流程段空产物列表、跳过建议和用户决定。
- Chromium 工作流场景：1/1 通过，覆盖首次引导、阶段/文件状态分离、共享材料无上传提示、当前阶段建议、执行控制台路径和用户跳过决定。
- 完整 `npm run verify`：74 个单元测试、125 个集成测试、17 个 Playwright 测试全部通过；格式、Lint、类型检查和 contracts/domain/server/web 构建全部通过。

## 范围确认

- 修改范围限于工作流服务的正式产物映射、工作流页面引导样式与内容、相关前端/后端测试和一个稳定化首页 E2E 选择器。
- 未改变项目事实模型、阶段顺序、审批门、跳过决策规则或其他业务页面行为。
- TASK-051、TASK-052 未执行或修改，继续保持 `draft`；本报告不解锁或启动后续任务。

## 独立验收建议

1. 运行 `npx tsx --test apps/server/test/workflow.integration.test.ts`，确认用户场景和 Discovery 验证不再返回重复独立文件链接。
2. 运行 `npx playwright test e2e/workflow.spec.ts --config=playwright.config.ts`，确认首次引导、状态分离、无需上传提示、执行入口和跳过用户决定均通过。
3. 打开 `/projects/workflow`，确认当前阶段有首要操作、读取产物和推荐下一步；确认“待开始”与“文件状态”不会被理解为上传要求。
4. 复跑 `npm run verify`；通过后将 REPORT-054 标记为 `accepted`、TASK-050 标记为 `completed`，再单独决定是否解锁 TASK-051。
