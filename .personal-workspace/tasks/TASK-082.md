---
schema_version: 1
id: TASK-082
title: 实现 Runtime 选择、预检与故障转移策略
status: draft
goal_id: GOAL-015
role: implementer
dependencies: [TASK-078, TASK-079, TASK-080, TASK-081]
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
target_branch: goal/GOAL-015
unblocked_by: TASK-081
---

# TASK-082：实现 Runtime 选择、预检与故障转移策略

## 目的与范围

根据任务角色、所需能力和项目配置选择 Adapter，在执行前预检；故障转移必须受控且可见。

## 验收条件

- 选择策略首先满足能力和权限，再考虑用户偏好；
- 每次执行记录最终 Adapter、模型、能力和选择理由；
- 预检失败不会创建伪执行记录或写入项目；
- 自动切换仅限用户预先批准的等价 Adapter 范围；
- 涉及权限扩大、模型成本或数据边界变化时必须重新申请用户决定；
- 故障转移保留原失败证据并防止重复副作用。

## 验证

覆盖能力不足、CLI 不可用、API 超时、允许切换和必须审批的切换。

## 边界与交接

不得以提高成功率为由绕过角色或项目权限。
