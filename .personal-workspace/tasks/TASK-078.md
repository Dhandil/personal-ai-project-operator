---
schema_version: 1
id: TASK-078
title: 实现 Adapter 注册、配置与密钥引用
status: draft
goal_id: GOAL-015
role: implementer
dependencies: [TASK-077]
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
target_branch: goal/GOAL-015
unblocked_by: TASK-077
---

# TASK-078：实现 Adapter 注册、配置与密钥引用

## 目的与范围

建立本地 Adapter 注册表和项目级 Runtime 选择配置，凭据只保存安全引用，不进入项目事实与审计正文。

## 验收条件

- 可注册、启用、禁用和查询 Adapter 及其版本、能力与健康状态；
- 项目可声明默认 Adapter、模型别名和非敏感参数；
- API key、token 等只以环境变量名或安全存储引用存在；
- 日志、报告和错误会脱敏；
- 缺失配置或版本不兼容时给出可执行恢复提示。

## 验证

覆盖注册、冲突版本、缺失密钥引用和脱敏测试并运行完整验证。

## 边界与交接

不得把明文凭据写入 Markdown、SQLite、Git 或审计 JSONL。
