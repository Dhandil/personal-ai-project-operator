---
schema_version: 1
document_type: development_plan
id: PLAN-001
title: 个人 AI 项目运营工具实施计划
status: draft
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
---

# Implementation Plan：个人 AI 项目运营工具

> 兼容 `spec-driven-development` 与 `/plan` 的入口文件。
>
> 正式 Spec：[`../stages/03-spec/03-spec.md`](../stages/03-spec/03-spec.md)
>
> 正式目标：[`../goals/`](../goals/)
>
> 正式任务：[`./`](./)
> 本文件不是独立事实源。

## 实施顺序

1. GOAL-001：建立可运行工程（TASK-001～004）
2. GOAL-002：建立治理领域模型（TASK-005～009）
3. GOAL-003：建立文件事实层（TASK-010～015）
4. GOAL-004：完成新项目初始化（TASK-016～019）
5. GOAL-005：完成 V0 治理闭环（TASK-020～028）
6. GOAL-006：完成 V0 验收与自举（TASK-029～031）
7. GOAL-007：建立 Git 执行隔离（TASK-032～034）
8. GOAL-008：接入 Codex CLI（TASK-035～041）
9. GOAL-009：完成自动执行、审核和交接（TASK-042～047）

## 后续版本路线（草案，未批准实现）

10. GOAL-012 / V0.3：完成项目前期 Agent 编排（TASK-055～061）
11. GOAL-013 / V0.4：完成项目经理 Agent 持续运营（TASK-062～068）
12. GOAL-014 / V0.5：支持已有项目与通用项目模板（TASK-069～076）
13. GOAL-015 / V0.6：建立多 Runtime Adapter 扩展层（TASK-077～084）

后续路线正式 Spec：[`../stages/03-spec/roadmap-v0.3-v0.6.md`](../stages/03-spec/roadmap-v0.3-v0.6.md)。

GOAL-012～015 及 TASK-055～084 当前全部为 `draft`。只有前一版本检查点已接受且用户明确批准下一目标后，才允许解锁对应首个任务。

依赖关系、架构决定、风险、验证检查点和成功标准以正式 Spec 为准。目标和任务状态只允许在对应正式文件中修改。
