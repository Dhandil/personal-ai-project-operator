---
schema_version: 1
document_type: report
id: REPORT-064
title: TASK-058 Idea Discovery Spec 阶段协调器实现验收报告
status: accepted
report_type: task_verification
acceptance_state: accepted
task_id: TASK-058
goal_id: GOAL-012
revision: 5
created_at: 2026-08-17T09:45:00Z
updated_at: 2026-08-17T11:10:00Z
verified_by: implementation_agent
verified_commit: 4c17786
accepted_by: project_owner
accepted_at: 2026-08-17T11:10:00Z
verification_commands:
  - npx tsx --test apps/server/test/stage-coordinator.integration.test.ts
  - npm run verify
---

# REPORT-064：TASK-058 Idea、Discovery、Spec 阶段协调器

## 实现结果

- 新增阶段协调器，按 Idea → Discovery → Spec 的确定性顺序启动，并从正式项目事实、持久化 stage run 和现有角色任务包重建每次运行上下文。
- 阶段运行支持 start、state、cancel、resume、retry；同一项目使用全局执行链锁，运行中的执行、恢复中的执行和待审批阶段不会被并行推进。
- Agent 候选产物先经过现有阶段 Schema 校验，再写入候选目录并启动只读审核；审核结果写入独立记录，只有用户明确批准才调用现有批准门写入正式阶段事实并允许下一阶段启动。
- 阶段交接携带已批准产物引用；返工继续使用原阶段角色，审核者使用只读任务包、空允许写入路径和禁止写入 formal facts 的边界。
- 中断保留精确 execution/session 上下文以供恢复；非法输出、运行失败、权限异常和清理失败会阻断推进、保存恢复信息并写入审计事件。
- 修复 `ExecutionLock` 执行 ID 关联：producer start、resume、retry 以及 reviewer 接管都会写入真实 executionId，锁释放逻辑保持不变；状态查询在运行期间返回 `active: true` 并显示当前 executionId。

## 验证结果

- TASK-058 专项集成测试：8/8 通过，覆盖延迟 Runtime active 状态、resume/retry 执行 ID、跨实例全局锁和高频 state 轮询。
- 完整 `npm run verify` 通过：97 个单元测试、137 个集成测试、22 个 Chromium Playwright 测试，以及格式、Lint、类型检查和 contracts/domain/server/web 构建。
- 未启动真实 Agent，未修改 UI，未生成正式 GOAL/TASK，也未执行 TASK-059 或其他后续任务。

## 独立验收建议

1. 重跑专项测试和完整 `npm run verify`。
2. 检查未批准时只有 stage-candidates、stage-reviews 和 stage-runs 变化，正式 Idea/Discovery/Spec 文件保持不变。
3. 逐阶段批准 Idea、Discovery、Spec，确认只有用户批准后才允许下一阶段，并检查已批准产物引用不重复。
4. 验证 changes_requested 使用原阶段角色返工；验证中断恢复使用持久化 executionId 和精确 sessionId；验证非法输出和 cleanup failure 均保持 blocked 且可恢复。
5. 确认 TASK-059 未被执行或修改。验收通过后由项目负责人将本报告标记为 `accepted`，再按治理依赖决定是否解锁 TASK-059。

## 独立验收结果

- 独立重跑阶段专项测试：8/8 通过。
- 独立连续两次运行完整 `npm run verify`：每次均为 97 个单元测试、137 个集成测试、22 个 Chromium Playwright 测试通过，格式、Lint、类型检查和构建全部通过。
- 两次完整验证均未出现 Windows `EPERM`、`EBUSY` 或 `EACCES` 原子替换失败；高频 `state()` 轮询回归稳定通过。
- 检查修复范围仅涉及原子替换退避重试和对应回归测试，阶段审批门、事实隔离、全局锁与 Agent 边界语义保持不变；TASK-059 未执行或修改。
- 验收结论：通过。REPORT-064 标记为 `accepted`，TASK-058 可标记为 `completed`，TASK-059 解锁为 `ready`。

## 状态声明

本报告已由项目负责人独立验收并标记为 `accepted`。TASK-058 已完成，TASK-059 已解锁为 `ready`。

## 全局锁修复复核结果

- `StageCoordinatorService` 默认构造函数已恢复使用模块级共享 `ExecutionLock`；producer start、resume、retry 和 reviewer 接管的 `assignExecution` 修复保持不变。
- 新增跨实例、跨项目回归：两个未注入自定义锁的协调器不能并行启动；第二个返回 `execution_active`，第一个完成后锁才释放。
- 本次修复实现提交：`3e1fb60`。
- 本次专项测试：7/7 通过；完整 `npm run verify`：97 单元、136 集成、22 Chromium，格式、Lint、类型检查和 contracts/domain/server/web 构建全部通过。
- TASK-059、UI、阶段审批门和产物事实隔离均未修改。

## Windows 原子替换修复复核

- 原子写入器对 Windows 目标替换期间的 `EPERM`、`EBUSY`、`EACCES` 增加有限退避重试，避免执行中频繁 `state()` 读取造成替换失败；未改变临时文件、同步、关闭后替换的原子写入流程。
- 新增高频 `state()` 轮询阶段集成测试；跨实例、跨项目全局锁回归继续通过。
- 修复实现提交：`4c17786`；TASK-058 专项测试 8/8 通过。
- 连续两次完整 `npm run verify` 均通过：每次 97 单元、137 集成、22 Chromium，格式、Lint、类型检查、contracts/domain/server/web 构建全部通过。
- 两次完整验证均未出现 `EPERM` 或 `EBUSY`；TASK-059 保持 `draft` 且未执行。
