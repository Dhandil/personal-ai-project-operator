---
schema_version: 1
id: TASK-071
title: 实现批准后的已有项目导入与恢复
status: draft
goal_id: GOAL-014
role: implementer
dependencies: [TASK-070]
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
target_branch: goal/GOAL-014
unblocked_by: TASK-070
---

# TASK-071：实现批准后的已有项目导入与恢复

## 目的与范围

用户批准预览后，为已有项目建立最小治理基线、中央索引和审计记录，并提供失败恢复信息。

## 验收条件

- 未批准时无任何写入副作用；
- 执行前重新校验目录指纹、Git 状态和冲突；
- 不覆盖已有文件，冲突必须交由用户选择；
- 导入成功后可每日启动并从项目事实重建状态；
- 中途失败明确列出已完成动作、未完成动作及安全恢复方法；
- Git 操作继续遵守禁止 force、reset、远程和历史改写的规范。

## 验证

覆盖批准、过期预览、同名冲突、中途失败和重启恢复并运行完整验证。

## 边界与交接

不得擅自重构原项目目录或改写业务代码。
