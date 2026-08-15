---
schema_version: 1
id: TASK-047
title: 完成 V0.2 全链路验收
status: completed
goal_id: GOAL-009
role: reviewer
dependencies: [TASK-034, TASK-048]
revision: 5
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-15T14:43:59Z
approval_id: APPROVAL-004
target_branch: goal/GOAL-009
unblocked_by: TASK-048
verification_report_id: REPORT-051
---

# TASK-047：完成 V0.2 全链路验收

## 目的与范围

以新 Agent 和临时项目完成“批准目标—执行—审核—返工—复审—提交—交接—恢复”的最终验收。

## 验收条件

- 新 Agent 不读取前一 Agent 聊天历史即可继续；
- 未授权修改不能进入目标分支，所有异常可恢复和追溯；
- 任务合入目标分支后，仍需用户批准才可合入 `main`。

## 启动登记

- 用户已批准在 REPORT-050 接受后启动 TASK-047。
- TASK-048 已完成独立验收，作为本任务的前置适配器能力。
- TASK-047 已进入 `in_progress`；本次仅登记启动，不代表验收已完成。

## 路线调整

- 当前 V0.2 全链路验收优先使用 TASK-048 的 Claude Code CLI Adapter。
- TASK-046 的 Codex CLI 真实验收已暂停存档，不再阻塞本任务的 Claude Code 验收路线。

## 验证

`npm run verify`、`npm run test:codex-cli`，并由用户审核 V0.2 验收报告和目标分支。

## 完成证据

- 新增 V0.2 组合式临时仓库场景，串联中断、持久恢复、实际成果差异与证据校验、首次审核退回、返工、复审、目标验收门、规范 task→goal 交付和 main 审批门。
- 新协调器与新审核服务仅从持久化执行上下文、正式任务/目标/审批事实和前一份结构化审核报告继续，不注入或读取前一 Agent 聊天历史。
- 首轮审核返回 `changes_requested`；返工后第二轮报告关联前一报告、递增轮次并保留审核者实例标识和结构化交接。
- 临时仓库中的越界文件使 task→goal 交付返回 `boundary_violation`，目标分支哈希保持不变，越界文件不会被系统覆盖；移除测试越界项后，规范提交与目标分支合并成功并包含实际 `Tasks: TASK-001`。
- 缺少独立 `main_merge` 审批时，goal→main 返回 `approval_required`，临时仓库 `main` 哈希保持不变；真实项目未执行 main 合并。
- V0.2 专项测试 4/4 通过；完整 `npm run verify` 通过：70 个单元测试、125 个集成测试、15 个 Playwright 测试，以及格式、Lint、类型检查和全部构建。
- Claude Code 2.1.233 + `deepseek-v4-pro` preflight 为 `canExecute: true`；真实临时项目 acceptance 七个 case 全部通过。Codex preflight 仍为历史 `spawn EPERM`，TASK-046 继续暂停存档。

## 交接

- TASK-047 已通过项目负责人独立验收，状态更新为 `completed`。
- GOAL-009 保持 `in_progress`；检查点已形成，但目标是否完成及是否合入 `main`仍需用户单独批准。
- TASK-046 保持暂停存档；未启动其他目标或后续任务。

## 预计文件

V0.2 E2E 场景、全链路夹具、验收报告、Dogfooding 指标报告和必要测试辅助文件。

## 边界与交接

审核任务不得直接修复发现；缺陷创建新任务。用户决定是否合入 `main` 以及下一阶段方向。

## 独立验收结论

- REPORT-051 已接受。
- V0.2 专项测试 4/4 通过；Claude 真实 acceptance 七个 case 全部通过。
- TASK-047 已完成；未执行真实项目的 `main` 合并。
