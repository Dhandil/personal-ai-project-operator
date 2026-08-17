---
schema_version: 1
id: GOAL-016
title: 修复 V0.3 核心可用性阻塞
status: in_progress
revision: 1
created_at: 2026-08-17T08:51:22Z
updated_at: 2026-08-17T08:51:22Z
tasks: [TASK-085, TASK-086, TASK-087, TASK-088, TASK-089, TASK-090, TASK-091]
approval_ids: [APPROVAL-008]
target_branch: goal/GOAL-016
unblocked_by: GOAL-012
first_task_id: TASK-085
---

# GOAL-016：修复 V0.3 核心可用性阻塞

## 目标

把 V0.3 从“自动化测试可通过、真实 Web 使用无法连续推进”修复到可以由用户在 Web 中完成：选择项目、启动今日工作、调用真实 Claude Code + DeepSeek、完成 Idea → Discovery → Spec、生成规划草案并进入第一个可执行任务。

本目标依据 [功能测试汇总-2026-08-17.md](../../功能测试汇总-2026-08-17.md) 建立，优先处理 P0 阻塞，再处理状态衔接和可用性问题。

## 验收条件

- Web 启动链可以明确选择并预检 Claude Code Adapter，不再默认使用 Fake Runtime；
- Idea 阶段真实输出能够通过阶段 Schema，阻塞运行可安全重试或恢复；
- 本机目录选择器明确返回选择成功、取消或失败，不再无反馈等待；
- 今日启动能够给出可执行的下一步并链接到对应页面；
- 阶段文件、工作流、状态快照和运行记录对同一事实给出一致视图；
- 新项目临时仓库可以从初始化一路走到第一个 `ready` 任务；
- 不改变审批门、只读审核、Git 安全边界和事实来源规则。

## 执行规则

- 任务按 TASK-085 → TASK-091 顺序执行；前一任务独立验收通过后再执行下一任务；
- 真实 Claude 验收只使用临时项目，不读取或修改用户的真实知识库、Fashion-Agent 或其他个人项目；
- 不执行真实项目 `main` 合并；
- 每个任务完成后生成实现证据、验证结果和“接下来进行哪个任务”的交接内容。

## 当前状态

- 用户已批准启动本目标；
- TASK-085 已解锁，其他任务等待依赖；
- GOAL-013（V0.4 项目经理持续运营）继续保持未启动，不与本修复目标并行。

