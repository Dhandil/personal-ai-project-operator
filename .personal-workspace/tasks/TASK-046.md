---
schema_version: 1
id: TASK-046
title: 完成真实 Codex CLI Adapter 验收
status: draft
goal_id: GOAL-009
role: reviewer
dependencies: [TASK-038, TASK-039, TASK-040, TASK-041, TASK-042, TASK-043, TASK-044, TASK-045]
revision: 1
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T12:29:07Z
---

# TASK-046：完成真实 Codex CLI Adapter 验收

## 目的与范围

在专用临时 Git 项目中验证本机真实 Codex CLI，而不是以模拟结果代替官方接口行为。

## 验收条件

- 实测安装/登录、JSONL、输出 Schema、cwd、写入和只读边界；
- 实测精确 session 续接、`--ephemeral` 和官方删除；
- 记录版本、沙箱模式、用量、失败和兼容性结论。

## 验证

用户知情后运行 `npm run test:codex-cli`；复核生成的验收报告。

## 预计文件

真实 CLI 测试入口、测试 Schema、临时项目夹具、验收报告生成器、测试。

## 边界与交接

可能消耗真实 Codex 用量；不得使用真实个人项目或读取凭据内容。发现不兼容先报告，不修改 Codex 内部文件。
