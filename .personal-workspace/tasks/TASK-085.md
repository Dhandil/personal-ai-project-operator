---
schema_version: 1
id: TASK-085
title: 将 Claude Code Runtime 接入 Web 生产启动链
status: completed
goal_id: GOAL-016
role: executor
dependencies: [TASK-061]
revision: 3
created_at: 2026-08-17T08:51:22Z
updated_at: 2026-08-17T09:42:00Z
target_branch: goal/GOAL-016
unblocked_by: GOAL-012
---

# TASK-085：将 Claude Code Runtime 接入 Web 生产启动链

## 目的与范围

修复 Web 启动默认使用 FakeAgentAdapter 的问题。让生产启动链能够通过明确配置选择 Claude Code Adapter，并在执行前展示认证、模型、工具和沙箱能力检查结果。

## 验收条件

- `main.ts` 或等价生产配置可以注入 Claude Code Adapter；Fake Adapter 只用于测试或显式模拟模式；
- 阶段执行和普通任务执行使用同一个已选择 Runtime，不允许一条链走 Fake、另一条链走真实 CLI；
- Web 有 Claude Runtime 的预检/能力诊断结果，至少区分认证、模型、执行能力和沙箱能力；
- 未通过预检时不启动 Agent、不写入正式成果，并提供用户可理解的修复建议；
- 模型、CLI 路径和超时来自受控配置，不把凭据写入项目事实、Git 或日志；
- 临时项目中使用 Claude Code + DeepSeek 完成一次无工具结构化响应和一次受限文件任务。

## 验证

运行 Runtime 专项测试、临时项目 Claude acceptance、完整 `npm run verify`；确认 Web API 不再默认返回 Fake session。

## 实现证据

- 生产入口 `apps/server/src/main.ts` 创建一个 Claude Runtime，并将同一实例注入普通任务协调器和 Idea、Discovery、Spec 阶段协调器；Fake Adapter 仅保留给显式测试注入。
- `ClaudeRuntimeService` 将受控 CLI 路径、模型和超时配置统一传给预检与 Adapter；启动和续接前先执行预检，未通过时不启动子进程、不写入正式成果。
- Web 提供只读 `/api/runtime/claude/preflight` 诊断接口，系统页展示认证、模型、执行能力、工具/沙箱能力和超时摘要，不展示凭据或认证原文。
- 新增服务器 Runtime 专项测试 3/3、系统页 Chromium 回归 1/1；覆盖预检阻断、凭据输出隔离、诊断路由和生产诊断展示。
- 真实验收仅使用临时项目：Executor、persistent cleanup、只读 Reviewer、ephemeral cleanup、精确 session resume、resume cleanup、temporary project cleanup 全部 `passed`；未操作真实个人项目或 main 合并。

## 验证结果

- `npm run test:claude-cli -- preflight`：通过，Claude Code 2.1.233，模型 `deepseek-v4-pro`，`canExecute: true`。
- `npm run test:claude-cli -- acceptance`：通过，7/7 case passed，默认超时 120 秒。
- `npm run verify`：通过，107 单元、148 集成、24 Chromium，格式、Lint、类型检查和构建全部通过。
- 实现提交：`f517ede`（`feat(runtime): 接入 Claude Code Web 生产启动链`）。

## 交接

任务已通过独立验收并完成；本任务未修改审批门、只读审核或 Git 合并安全边界。下一步进行 TASK-086。

## 独立验收

- REPORT-069 已由独立复核接受。
- Runtime 专项 3/3、Web 诊断 Chromium 1/1、真实 Claude Code + DeepSeek 临时项目 7/7 通过。
- 独立运行完整 `npm run verify`：107 单元、148 集成、24 Chromium，以及格式、Lint、类型检查和构建全部通过。
- 未访问真实个人项目，未执行 main 合并；工作区在验收前保持干净。

## 边界与交接

不得修改阶段 Schema、审批语义或 Git 合并规则；完成后将真实 Runtime 能力和启动方式交接给 TASK-086。
