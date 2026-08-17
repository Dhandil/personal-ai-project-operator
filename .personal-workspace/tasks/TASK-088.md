---
schema_version: 1
id: TASK-088
title: 让今日启动返回明确下一步并进入对应页面
status: draft
goal_id: GOAL-016
role: executor
dependencies: [TASK-087]
revision: 1
created_at: 2026-08-17T08:51:22Z
updated_at: 2026-08-17T08:51:22Z
target_branch: goal/GOAL-016
unblocked_by: TASK-087
---

# TASK-088：让今日启动返回明确下一步并进入对应页面

## 目的与范围

修复“启动今日工作成功但用户不知道下一步”的问题，让启动摘要根据事实给出下一行动、原因和页面入口。

## 验收条件

- 无目标的新项目明确建议进入 Idea 阶段；
- 有待审核阶段时明确链接到工作流审核；
- 有 ready 任务时明确链接到执行控制台；
- 有阻塞、恢复或用户决策时明确指出原因和操作页面；
- 启动不会自动执行任务、批准产物或改变用户决策；
- 从工作台启动今日工作后，用户能直接进入当前项目上下文。

## 验证

覆盖无目标、待审核、ready、blocked 和恢复五类临时项目状态；运行 API、Chromium 和完整 `npm run verify`。

## 边界与交接

不创建新的事实源；推荐下一步必须由项目事实推导。完成后交接给 TASK-089。

