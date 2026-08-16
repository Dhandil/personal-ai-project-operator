---
schema_version: 1
id: TASK-075
title: 实现导入与模板选择界面
status: draft
goal_id: GOAL-014
role: implementer
dependencies: [TASK-071, TASK-072, TASK-073, TASK-074]
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
target_branch: goal/GOAL-014
unblocked_by: TASK-074
---

# TASK-075：实现导入与模板选择界面

## 目的与范围

在项目模块中清晰区分“新建项目”和“导入已有项目”，引导用户选择模板、查看预览并批准。

## 验收条件

- 新建与导入入口、影响和风险清晰区分；
- 模板差异、可配置项、冲突和写入计划可在首屏理解；
- 目录选择器与手动路径均可用；
- 未批准、预览过期、冲突和恢复状态有明确下一步；
- 桌面端局部滚动，窄屏无横向溢出且全部功能可达。

## 验证

运行前端专项测试、Chromium 场景和完整验证。

## 边界与交接

不得在 UI 中把只读预览伪装为已经导入。
