---
schema_version: 1
id: TASK-068
title: 完成 V0.4 多日项目运营验收
status: draft
goal_id: GOAL-013
role: reviewer
dependencies: [TASK-062, TASK-063, TASK-064, TASK-065, TASK-066, TASK-067]
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
target_branch: goal/GOAL-013
unblocked_by: TASK-067
---

# TASK-068：完成 V0.4 多日项目运营验收

## 目的与范围

使用临时项目模拟跨天关闭、重启、执行、审核、阻塞和用户决策，验证项目经理不依赖聊天历史持续运营。

## 验收条件

- 覆盖每日启动、周期报告、自动调度、阻塞升级、用户决定和恢复；
- 用户不需要复制任务或角色交接提示词；
- 关闭应用后不会假装后台运行，重启报告准确；
- 无审批需求时仍产生可见进度报告；
- 目标结束时停止并生成检查点；
- 生成 V0.4 验收报告并由用户接受。

## 验证

运行 V0.4 专项 E2E 和完整 `npm run verify`。

## 边界与交接

不得自动选择其他项目，不得自行启动 GOAL-014。
