---
schema_version: 1
id: TASK-056
title: 定义前期角色模板与阶段任务包
status: completed
goal_id: GOAL-012
role: executor
dependencies: [TASK-055]
revision: 4
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T15:20:00Z
target_branch: goal/GOAL-012
unblocked_by: TASK-055
verification_report_id: REPORT-062
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

- 前期角色模板、阶段任务包和结构化输出规则已完成，REPORT-062 已通过项目负责人独立验收。
- 不执行 Agent，不复制聊天历史，不把 Skill 全文写入项目事实；未执行 TASK-057 或其他后续任务。
- TASK-057 已按目标级批准和依赖规则解锁；未执行其他后续任务。

## 完成证据

- 实现提交：`ea0d425612279b4afbebcca5a119cd65642d515b`。
- 新增厂商无关的项目负责人、Idea、Discovery、Spec 和规划角色模板，分别定义职责、禁止事项、必读文件、按需文件、允许写入路径和结构化输出 Schema ID。
- 阶段任务包包含阶段运行 ID、阶段、项目想法、前序已批准产物、当前目标、角色模板、写入权限和输出规则；不包含 Agent、模型或会话绑定。
- 阶段审核角色只能生成 `stage_review_result_v1` 结构化结果，允许写入路径为空并禁止写入阶段产物、目标、任务和审批事实。
- 专项测试：17/17 通过；覆盖角色边界、前序批准产物、当前目标、角色兼容性、只读审核和结构化输出规则。
- 完整 `npm run verify`：93 个单元测试、129 个集成测试、22 个 Playwright 测试，以及格式、Lint、类型检查和 contracts/domain/server/web 构建全部通过。
