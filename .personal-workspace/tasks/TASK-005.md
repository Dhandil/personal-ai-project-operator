---
schema_version: 1
id: TASK-005
title: 定义 ID 状态时间和共享数据契约
status: completed
goal_id: GOAL-002
role: executor
dependencies: [TASK-004]
revision: 4
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T01:23:02Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-004
verification_report_id: REPORT-005
---

# TASK-005：定义 ID、状态、时间和共享数据契约

## 目的与范围

为正式记录定义不可变 ID、状态枚举、UTC 时间和 Zod 输入输出契约。

## 验收条件

- 所有确认的 ID 前缀和状态可校验；
- 非法 ID、状态和时间被拒绝；
- 契约可以被 Web 与 Server 共同导入。

## 验证

`npm run test:unit -- contracts`；`npm run typecheck`。

## 预计文件

`packages/contracts/package.json`、`tsconfig.json`、`src/identifiers.ts`、`src/statuses.ts`、`src/index.ts`及同文件测试。

## 边界与交接

不得增加未确认状态或 ID 类型。完成后解锁 TASK-006～008。

## 完成输出

- 状态：`completed`
- 输出：`@personal-ai-operator/contracts` workspace，提供正式 ID、状态、UTC ISO 时间和 `recordEnvelopeSchema` 共享 Zod 契约。
- ID 仅支持 `GOAL`、`TASK`、`DEC`、`HANDOFF`、`REPORT`、`EXEC` 六类前缀，序号为大于 `000` 的三位数字。
- 状态仅支持 Spec 已确认的 5 个正常状态和 4 个控制状态，未增加新状态。
- 契约包通过 dist 导出入口供 Web 与 Server 共同导入；未实现 TASK-006～009 的领域行为。

## 验证证据

- `npm ci --ignore-scripts --no-audit --no-fund`：通过。
- `npm run test:unit -- contracts`：通过，contracts 测试文件 1 个、6 个测试通过。
- `npm run test:unit`：通过，contracts/server/web 共 3 个测试文件、9 个测试通过。
- `npm run typecheck`：通过，contracts/server/web 三个 workspace 均通过。
- `npm run lint`、`npm run format:check`：均通过。
- `npm run build`：通过，contracts TypeScript 编译、server 编译和 web Vite 构建均成功。
- 共享包导入验证：构建后从 `@personal-ai-operator/contracts` 包入口解析 `TASK-005` 和有效记录信封，结果通过。
- `npm run test:integration`：后端健康检查 1 个测试通过；`npm run test:e2e`：Chromium 1/1 通过，确认无现有前后端回归。
- `npm run verify`：通过，完整质量顺序执行成功；`git diff --check`：通过。

## 提交与交接

- 提交：本任务验收提交（commit message 包含 `Tasks: TASK-005`）。
- 交接：TASK-006～TASK-008 可使用本契约包定义领域模型；TASK-009 可复用状态枚举和记录信封。未修改 GOAL-002 状态或提前实现后续任务。
- 遗留问题：无。
