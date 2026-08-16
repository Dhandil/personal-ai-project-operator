---
schema_version: 1
id: TASK-056
title: 定义前期角色模板与阶段任务包
status: draft
goal_id: GOAL-012
role: executor
dependencies: [TASK-055]
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
target_branch: goal/GOAL-012
unblocked_by: TASK-055
---

# TASK-056：定义前期角色模板与阶段任务包

## 目的与范围

建立厂商无关的项目负责人、Idea、Discovery、Spec 和规划角色模板，以及每个阶段的必读、按需读取、允许写入和结构化输出规则。

## 验收条件

- 每个角色包含职责、禁止事项、必读文件、按需文件和允许写入路径；
- 审核角色只能生成审核结果，不能修改被审核阶段产物；
- 阶段任务包包含项目想法、前序已批准产物、当前目标和输出 Schema；
- 角色不绑定 Claude、Codex 或具体模型；
- 缺失必读文件、越界路径和非法角色组合会被拒绝。

## 验证

运行角色任务包单元/集成测试和完整 `npm run verify`。

## 边界与交接

不执行 Agent，不复制聊天历史，不把 Skill 全文写入项目事实。完成后 TASK-057 可申请解锁。
