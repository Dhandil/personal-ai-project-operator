---
schema_version: 1
id: TASK-058
title: 实现 Idea Discovery Spec 阶段协调器
status: in_review
goal_id: GOAL-012
role: executor
dependencies: [TASK-057, TASK-048]
revision: 6
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-17T11:05:00Z
target_branch: goal/GOAL-012
unblocked_by: TASK-057
verification_report_id: REPORT-064
---

# TASK-058：实现 Idea Discovery Spec 阶段协调器

## 目的与范围

通过现有 Agent Runtime 依次启动、取消、恢复和审核 Idea、Discovery、Spec 阶段，不依赖前一 Agent 会话。

## 验收条件

- 每次运行从正式状态和阶段任务包冷启动；
- 支持 start、resume、cancel、retry 和 state 查询；
- 阶段输出先校验再进入待审核，只有用户批准才进入下一阶段；
- 返工由原阶段角色处理，审核者保持只读；
- 中断、超时、非法输出、越界和清理失败均阻断推进并写审计；
- 同一时间只允许一个全局执行链。

## 验证

使用 Fake Adapter 覆盖成功、返工、中断、恢复和越权测试，并运行 `npm run verify`；真实 Adapter 验收由目标启动审批决定。

## 边界与交接

不生成开发计划，不自动批准阶段，不实现并行执行。完成后 TASK-059 可申请解锁。
## 完成证据

- 已实现 Idea、Discovery、Spec 三阶段协调、启动顺序、阶段交接、候选产物与审核结果关联，以及阻塞和恢复流程。
- 候选产物、审核结果、用户批准记录和正式阶段事实保持分离；只有用户批准才推进下一阶段并写入正式阶段事实。
- Fake Agent Adapter 专项测试覆盖三阶段顺序、审批门、返工、非法输出、精确 session 恢复和清理失败；未启动真实 Agent，未修改 UI，未生成正式 GOAL/TASK。
- 代码提交：`eaa1e77`；专项测试 6/6 通过；完整 `npm run verify` 通过（97 单元、135 集成、22 Chromium，以及质量检查和构建）。

## 交接

任务状态保持 `in_review`，等待项目负责人独立验收 REPORT-064；TASK-059 未执行且保持原状态。
- 修复复核项：producer start、resume、retry 及 reviewer 接管均向当前锁写入真实 executionId；延迟 Runtime 回归确认运行中 `state.active` 为 `true`，并显示当前 executionId。

## 全局锁修复复核记录

- 恢复 `StageCoordinatorService` 默认使用模块级共享 `ExecutionLock`，保留 producer/reviewer 的真实 `executionId` 绑定。
- 新增两个未注入自定义锁的协调器跨项目回归：第一个执行期间第二个返回 `execution_active`，第一个完成后锁释放。
- 修复提交：`3e1fb60`；阶段专项测试 7/7 通过；完整 `npm run verify` 通过（97 单元、136 集成、22 Chromium，以及质量检查和构建）。

## Windows 原子替换修复复核记录

- 原子写入器在目标替换遇到 Windows `EPERM`、`EBUSY` 或 `EACCES` 时进行有限退避重试；临时文件写入、同步、关闭后再替换的原子语义保持不变。
- 新增高频 `state()` 轮询回归，覆盖执行中阶段文件替换；跨实例全局锁测试保持通过。
- 修复提交：`4c17786`；阶段专项测试 8/8 通过。
- 连续两次完整 `npm run verify` 均通过：每次 97 单元、137 集成、22 Chromium，以及格式、Lint、类型检查和构建。
