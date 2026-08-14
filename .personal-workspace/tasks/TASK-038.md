---
schema_version: 1
id: TASK-038
title: 实现 Codex CLI 环境与沙箱能力检查
status: changes_requested
goal_id: GOAL-008
role: executor
dependencies: [TASK-035]
revision: 5
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T17:38:39Z
approval_id: APPROVAL-003
target_branch: goal/GOAL-008
unblocked_by: TASK-035
---

# TASK-038：实现 Codex CLI 环境与沙箱能力检查

## 目的与范围

检测 Codex CLI 安装、版本、登录可用性、官方命令及 Windows 原生沙箱能力。

## 验收条件

- 缺失安装、登录或必要命令时阻止真实执行并给出操作建议；
- 优先 elevated，回退 unelevated 时显著提示；
- 检测结果带时间和版本，可供真实验收引用。

## 验证

模拟探测集成测试；本机条件允许时运行 `npm run test:codex-cli -- preflight`。

## 预计文件

Codex 进程探测器、能力模型、Windows 沙箱探测、诊断 Route、测试。

## 边界与交接

不得自动安装、登录或修改用户 Codex 配置。完成后交给 TASK-039、046。

## 完成证据

- 新增共享 Codex CLI 能力模型，记录检查时间、安装状态、版本、登录状态、`codex exec` / `exec resume` / `delete` 命令、JSONL、输出 Schema 和沙箱参数能力。
- 新增可注入进程探测器与 Windows 权限检查：优先 `elevated`，不可用时回退 `unelevated` 并提供显著警告；不读取或输出凭据内容。
- 缺失安装、启动权限、登录、必要命令或沙箱能力时，报告 `canExecute: false`、阻断原因和操作建议；未执行真实 `codex exec`。
- 新增只读诊断 Route：`GET /api/runtime/codex/preflight`，以及 `npm run test:codex-cli -- preflight` 真实环境检查入口。
- 模拟探测集成测试：5/5 通过，覆盖 elevated 成功、未安装、未登录、必要命令/沙箱缺失和诊断 Route。
- 本机真实 preflight 识别到 Windows AppX Codex，但服务进程启动收到 `EPERM`，正确阻断执行并建议提升 Windows 进程权限或配置可启动路径；未安装、登录或配置被修改。
- 完整 `npm run verify` 通过：66 个单元测试、82 个集成测试、14 个 Chromium Playwright 测试，以及格式、Lint、类型检查和构建。

## 交接

- TASK-038 独立复核发现登录状态解析边界缺陷，状态更新为 `changes_requested`，等待修复后重新复核。
- 实现范围仅覆盖 TASK-038；未执行 TASK-039 或 GOAL-009。
- 修复要求：`codex login status` 成功但输出为空或无法识别时必须报告 `unknown` 并阻断 `canExecute`，补充回归测试；修复后再交接 TASK-039、TASK-046。
