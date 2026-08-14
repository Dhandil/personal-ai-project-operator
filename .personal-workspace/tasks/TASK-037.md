---
schema_version: 1
id: TASK-037
title: 生成角色任务包和结构化输出 Schema
status: completed
goal_id: GOAL-008
role: executor
dependencies: [TASK-024, TASK-025, TASK-035]
revision: 5
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T17:11:05Z
approval_id: APPROVAL-003
target_branch: goal/GOAL-008
unblocked_by: TASK-035
verification_report_id: REPORT-039
---

# TASK-037：生成角色任务包和结构化输出 Schema

## 目的与范围

根据项目、角色和任务事实生成最小但充分的 Agent 输入包与角色专属结果 Schema。

## 验收条件

- 包含职责、必读、任务边界、实际项目路径、验证和交接要求；
- 不包含无关完整历史聊天；
- 执行者与审核者使用不同输出 Schema 和权限说明。

## 验证

`npm run test:unit -- task-package`；使用固定夹具快照检查。

## 预计文件

上下文路由器、任务包构建器、执行结果 Schema、审核结果 Schema、测试。

## 边界与交接

不得把所有项目文件默认塞入上下文。完成后交给 TASK-039、043。

## 完成证据

- 新增角色任务包构建服务：按项目、目标、任务和角色事实生成最小充分上下文，包含职责、必读项、任务边界、实际项目路径、验证要求和交接要求；不包含聊天历史或全量项目文件。
- 新增执行者与审核者专属结构化输出 Schema，并明确权限差异：执行者为 `workspace_write`，审核者为 `read_only`。
- 新增任务包 API：`GET/POST /api/projects/task-packages`。
- 指定单元测试：`npm run test:unit -- task-package`，2/2 通过。
- 指定集成测试：任务包构建与 API 场景 3/3 通过。
- 完整 `npm run verify` 通过：66 个单元测试、77 个集成测试、14 个 Chromium Playwright 测试，以及格式、Lint、类型检查和构建。

## 交接

- TASK-037 已完成独立验收，状态为 `completed`，验证报告为 `REPORT-039`。
- 实现范围仅覆盖 TASK-037；未执行 TASK-038、TASK-039 或 GOAL-009。
- TASK-038 保持 `ready`，TASK-039 继续等待 TASK-038；后续交接对象为 TASK-039、TASK-043。
