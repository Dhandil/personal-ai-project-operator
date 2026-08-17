---
schema_version: 1
id: TASK-086
title: 修复真实阶段输出 Schema 与阻塞重试
status: ready
goal_id: GOAL-016
role: executor
dependencies: [TASK-085]
revision: 2
created_at: 2026-08-17T08:51:22Z
updated_at: 2026-08-17T09:42:00Z
target_branch: goal/GOAL-016
unblocked_by: TASK-085
---

# TASK-086：修复真实阶段输出 Schema 与阻塞重试

## 目的与范围

让 Claude Code + DeepSeek 生成的 Idea、Discovery、Spec 结构化输出能够稳定通过阶段产物校验，并让当前输出失败后的重试/恢复路径可以继续，不需要用户手工编辑内部字段。

## 验收条件

- `schemaVersion`、`kind`、`stage` 及阶段必填字段在真实结构化输出中正确传递；
- provider 常见字段格式不会导致合法内容被误判为非法，但缺少真正必填字段仍会阻断；
- 阶段输出失败后，用户可以选择重新执行，旧失败记录保留且新运行 ID 可追踪；
- Idea → Discovery → Spec 每一步都需要对应审核/批准门，不自动写正式事实；
- 临时项目真实 Claude acceptance 覆盖成功、非法输出、重试、审核退回和复审。

## 验证

运行阶段协调器专项测试、Claude 临时项目测试和完整 `npm run verify`。

## 边界与交接

不得绕过用户批准，不得把 Agent 输出直接写成正式目标/任务；完成后交接给 TASK-087。
