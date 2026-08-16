---
schema_version: 1
id: TASK-084
title: 完成 V0.6 多 Adapter 全链路验收
status: draft
goal_id: GOAL-015
role: reviewer
dependencies:
  [TASK-077, TASK-078, TASK-079, TASK-080, TASK-081, TASK-082, TASK-083]
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
target_branch: goal/GOAL-015
unblocked_by: TASK-083
---

# TASK-084：完成 V0.6 多 Adapter 全链路验收

## 目的与范围

验证同一项目任务可在 Fake、Claude Code 与通用 API Adapter 间按能力选择和安全交接，且治理语义一致。

## 验收条件

- 至少两种真实执行方式在临时项目完成结构化任务；
- API Agent 通过工具网关安全修改文件，审核角色保持只读；
- 取消、续接或替代恢复路径至少覆盖一条；
- Adapter 不可用、能力不足和非法输出均不会推进任务；
- 凭据不进入项目事实、Git、日志或报告；
- 仍保持单执行链，用户审批与 main 合并门有效；
- 生成 V0.6 检查点报告并由用户接受。

## 验证

运行多 Adapter 专项 E2E、完整 `npm run verify` 和安全回归检查。

## 边界与交接

不得自动启动未规划版本；并行多 Agent、云服务与多用户继续延期。
