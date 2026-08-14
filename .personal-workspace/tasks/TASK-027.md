---
schema_version: 1
id: TASK-027
title: 实现审批记录和目标验收
status: ready
goal_id: GOAL-005
role: executor
dependencies: [TASK-008, TASK-009, TASK-020, TASK-023]
revision: 2
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T10:42:10Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-023
---

# TASK-027：实现审批记录和目标验收

## 目的与范围

统一五类审批记录、证据快照、批准/拒绝/修改结果和目标验收入口。

## 验收条件

- 审批记录引用当时对象 revision 与内容哈希；
- 过期审批不能授权已变化内容；
- 目标验收和 `main` 合并批准保持独立可审计步骤。

## 验证

`npm run test:integration -- approvals` 和审批历史 UI 检查。

## 预计文件

审批服务、审批 Route、审批页面、证据摘要组件、测试。

## 边界与交接

不实现自定义审批门。完成后交给 TASK-034。
