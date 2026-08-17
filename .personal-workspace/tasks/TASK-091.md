---
schema_version: 1
id: TASK-091
title: 完成 V0.3 核心可用性修复验收
status: draft
goal_id: GOAL-016
role: reviewer
dependencies: [TASK-085, TASK-086, TASK-087, TASK-088, TASK-089, TASK-090]
revision: 1
created_at: 2026-08-17T08:51:22Z
updated_at: 2026-08-17T08:51:22Z
target_branch: goal/GOAL-016
unblocked_by: TASK-090
---

# TASK-091：完成 V0.3 核心可用性修复验收

## 目的与范围

用临时项目和当前 Web 流程验证修复后的真实可用性，不扩大到 V0.4 项目经理持续运营。

## 验收条件

- 临时项目可以完成初始化、Idea、Discovery、Spec、规划批准并生成首个 `ready` 任务；
- 真实 Claude Code + DeepSeek 至少完成一条阶段生产和一条受限执行；
- 目录选择器成功、取消、失败均有结果；
- 今日启动能给出下一步并进入对应页面；
- 阶段事实、状态视图、审核和恢复记录一致；
- 自动化测试、真实临时项目验收和功能测试报告均通过；
- 生成独立验收报告，明确未解决问题。

## 验证

运行完整 `npm run verify`、真实 Claude 临时项目验收、Windows 目录选择器手工验收和功能测试清单。

## 边界与交接

不得使用真实个人项目，不得自动接受本目标或启动 GOAL-013；完成后等待用户验收。

