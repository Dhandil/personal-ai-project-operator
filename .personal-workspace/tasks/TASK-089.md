---
schema_version: 1
id: TASK-089
title: 统一阶段文件工作流和运行状态视图
status: draft
goal_id: GOAL-016
role: executor
dependencies: [TASK-088]
revision: 1
created_at: 2026-08-17T08:51:22Z
updated_at: 2026-08-17T08:51:22Z
target_branch: goal/GOAL-016
unblocked_by: TASK-088
---

# TASK-089：统一阶段文件工作流和运行状态视图

## 目的与范围

解决历史阶段文件、默认工作流、阶段运行、status 快照和目标任务列表互相脱节的问题，让页面明确区分历史材料、当前运行和正式事实。

## 验收条件

- 历史阶段材料不会被误显示为当前已批准阶段成果；
- 当前运行状态、候选产物、审核结果和正式批准事实来源明确；
- `status.md`、`workflow.md` 和阶段运行视图由同一组正式事实重建；
- 删除或外部修改生成快照后可以恢复，且不会把快照当作事实源；
- 新项目、已有阶段材料、阻塞运行和批准完成四类状态均有一致展示。

## 验证

运行状态投影、阶段协调器、恢复和 Chromium 视图回归测试，并执行完整 `npm run verify`。

## 边界与交接

不得删除历史快照或改写 TASK-031 历史边界；完成后交接给 TASK-090。

