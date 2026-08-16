---
schema_version: 1
id: TASK-064
title: 实现定期进度摘要与成果报告
status: draft
goal_id: GOAL-013
role: executor
dependencies: [TASK-062, TASK-063]
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
target_branch: goal/GOAL-013
unblocked_by: TASK-063
---

# TASK-064：实现定期进度摘要与成果报告

## 目的与范围

在用户启动的项目会话期间，按可配置间隔和关键事件生成进度报告，即使不需要审批也让用户知道成果和状态。

## 验收条件

- 支持手动请求、关键事件触发和用户设置的时间间隔；
- 摘要包含完成成果、当前动作、进度、风险、阻塞、下一步和是否需要用户操作；
- 报告从事实与审计事件生成，不信任 Agent 自述；
- 重连和刷新不会重复丢失或错误去重事件；
- 应用关闭后不承诺后台继续计时，重启时生成恢复摘要。

## 验证

运行报告生成、间隔、重连和恢复测试，再运行 `npm run verify`。

## 边界与交接

不发送外部邮件、通知或日历事件。完成后 TASK-065 可申请解锁。
