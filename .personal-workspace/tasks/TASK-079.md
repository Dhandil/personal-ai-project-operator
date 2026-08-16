---
schema_version: 1
id: TASK-079
title: 迁移现有 Runtime Adapter 到 SDK
status: draft
goal_id: GOAL-015
role: implementer
dependencies: [TASK-077, TASK-078]
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
target_branch: goal/GOAL-015
unblocked_by: TASK-078
---

# TASK-079：迁移现有 Runtime Adapter 到 SDK

## 目的与范围

让 Fake、Codex CLI 与 Claude Code Adapter 通过新 SDK 注册和执行，保留既有行为与历史阻断事实。

## 验收条件

- Fake Adapter 继续覆盖成功、失败、中断、越权、非法输出和清理失败；
- Claude Code + DeepSeek 的已验收执行、只读审核、续接和无持久化能力无回归；
- Codex CLI 未安装或 Windows EPERM 时仍只报告阻断，不伪造成功；
- 旧 execution/session 事实可兼容读取或提供迁移说明；
- 现有专项和完整测试全部通过。

## 验证

运行 Adapter 兼容矩阵、既有回归测试与完整 `npm run verify`。

## 边界与交接

不得把 Codex 历史阻断改写为已验收，不要求用户安装 Codex CLI。
