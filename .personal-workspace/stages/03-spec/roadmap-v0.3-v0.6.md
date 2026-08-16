---
schema_version: 1
document_type: roadmap_spec
id: ROADMAP-V0.3-V0.6
title: V0.3 至 V0.6 产品与工程路线
status: draft
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
base_spec: .personal-workspace/stages/03-spec/03-spec.md
goals: [GOAL-012, GOAL-013, GOAL-014, GOAL-015]
---

# Spec：V0.3 至 V0.6 产品与工程路线

## 1. Objective

在 V0.2 已完成的任务级 Agent 执行、审核、返工、交接和恢复闭环之上，按顺序补齐项目前期编排、项目经理持续运营、通用项目接入以及多 Runtime Adapter 扩展能力，使个人用户从一个想法开始，经过批准后可以持续推进 Coding 或知识生产项目。

成功不是增加更多页面，而是逐步减少用户承担的提示词复制、阶段启动、任务转换、角色调度和进度追问工作，同时保留目标、范围、重要阶段和 `main` 合并的用户决策门。

## 2. Confirmed assumptions

- V0.3、V0.4、V0.5、V0.6 必须依次完成和验收，不并行启动；
- 产品继续面向本地单用户，不加入登录、云部署、多用户或企业权限；
- 文件仍是项目事实源，中央数据库只保存索引、设置和可重建缓存；
- 用户每天主动进入并启动项目，当前路线不实现 7×24 小时无人值守；
- 同一时间仍只运行一条全局执行链，V0.6 不引入并行 Agent；
- 阶段 Agent、项目经理 Agent 和规划 Agent 必须通过现有 Runtime 接口运行，不能绑定单一厂商；
- V0.6 的 API Agent 通过工作台提供的受控文件和命令工具修改项目，不能直接获得无限制本机访问；
- 每个版本目标在用户批准前均保持 `draft`。

## 3. Tech stack

- TypeScript 5.9、Node.js 24、npm Workspaces；
- React、Vite、Fastify；
- Markdown/YAML Front Matter 项目事实层与 SQLite 中央索引；
- Vitest、Node test runner、Playwright Chromium；
- 现有 Agent Runtime、Claude Code/Codex/Fake Adapter、Git Worktree 和治理策略作为扩展基础。

不在路线规划阶段新增依赖；实现任务发现确需新增依赖时必须先提出并获得用户批准。

## 4. Commands

- 安装：`npm ci`
- 开发：`npm run dev`
- 格式检查：`npm run format:check`
- Lint：`npm run lint`
- 类型检查：`npm run typecheck`
- 单元测试：`npm run test:unit`
- 集成测试：`npm run test:integration`
- 浏览器测试：`npm run test:e2e`
- 构建：`npm run build`
- 完整验证：`npm run verify`
- Claude Code 真实验收：`npm run test:claude-cli -- acceptance`
- Codex CLI 真实预检：`npm run test:codex-cli -- preflight`

真实 CLI/API 验收只在对应 Adapter 任务、版本检查点或用户明确要求时运行，不属于每次日常 `verify`。

## 5. Project structure

- `packages/contracts`：跨层 ID、状态、事件和 Runtime 契约；
- `packages/domain`：阶段、目标、任务、审批、项目经理和模板领域策略；
- `apps/server/src`：协调服务、事实仓储、Runtime Adapter、API 和工具网关；
- `apps/web/src`：前期规划、运营、模板、Adapter 配置和诊断界面；
- `apps/server/test`：集成、恢复、安全边界和 Adapter 测试；
- `e2e`：版本级浏览器闭环；
- `.personal-workspace/stages`：阶段产物和路线 Spec；
- `.personal-workspace/goals`、`.personal-workspace/tasks`：正式目标与任务事实；
- `tasks/plan.md`、`tasks/todo.md`：兼容入口和生成视图，不作为独立事实源。

## 6. Code style

继续使用严格 TypeScript、显式结果类型、不可变输入和结构化错误，不以异常或自由文本承担领域状态：

```ts
export function chooseNextAction(
  snapshot: Readonly<ProjectSnapshot>,
): Result<ProjectAction, GovernanceError> {
  if (snapshot.pendingApprovalId !== null) {
    return ok({ type: "await_user_approval", approvalId: snapshot.pendingApprovalId });
  }
  return ok({ type: "continue_current_goal", goalId: snapshot.goalId });
}
```

- 文件和类型使用英文命名，用户界面和提交简述按项目设置使用中文；
- 领域决策放在 `packages/domain`，基础设施和 UI 不重复隐藏规则；
- 未知 YAML 字段必须保留；写入继续使用 revision/hash、原子写和审计。

## 7. Testing strategy

- 领域状态、转换、推荐和选择策略使用单元测试；
- 文件事实、恢复、审批、Runtime、导入和工具网关使用临时目录集成测试；
- 关键用户路径使用 Chromium E2E；
- 每个任务先运行专项测试，再运行完整 `npm run verify`；
- 每个版本最后使用临时项目完成端到端验收，Coding 与知识生产场景不得使用真实个人项目；
- 真实 Adapter 验收必须记录版本、配置模型、能力、超时、用量、失败和清理结果。

## 8. Boundaries

### Always do

- 项目文件作为事实源，状态投影可重建；
- Agent 只能在任务和角色允许边界内读取、写入和执行；
- 阶段、目标和任务完成均校验实际成果与结构化证据；
- 重要阶段、目标启动、范围变化和 `main` 合并由用户决定；
- 失败、越权、恢复、取消和清理结果写入审计。

### Ask first

- 新增生产依赖、数据库不可逆迁移或修改公开契约；
- 扩大到并行 Agent、云部署、登录、多用户或外部工作站集成；
- 读取真实凭据内容、调用付费 API 真实验收或操作真实个人项目；
- 修改版本范围、任务依赖或成功标准。

### Never do

- 让 Agent 自行批准阶段、目标、范围变化或 `main` 合并；
- 把聊天历史、中央数据库或生成的 `status.md` 当成唯一事实源；
- 把 API 密钥写入项目事实、日志、报告或提交；
- 静默覆盖外部修改、删除失败证据或弱化测试来通过验收；
- 在 V0.6 前实现多执行链并行，在当前路线内实现云端无人值守。

## 9. V0.3：项目前期 Agent 编排

### Objective

把新项目从初始想法推进到可供用户统一审核的正式 Spec、目标、角色和任务草案，并在批准后衔接现有任务执行闭环。

### Success criteria

- 用户输入想法后可启动 Idea、Discovery、Spec 阶段 Agent；
- 每个阶段从角色任务包读取必读材料，并只更新允许的阶段产物；
- 阶段状态、文件状态和用户审批状态分离；
- 阶段失败、中断、返工和恢复不误推进下一阶段；
- Spec 可生成目标、角色和任务卡草案，草案在批准前不能成为可执行事实；
- 用户一次审核规划草案后，系统写入正式事实并解锁第一个任务；
- 新 Agent 不依赖前一阶段聊天历史即可继续；
- 临时项目完成从想法到首个 `ready` 任务的 V0.3 E2E。

### Non-goals

- 不导入已有项目；不支持知识生产专用模板；不运行多条并行执行链。

## 10. V0.4：项目经理 Agent 持续运营

### Objective

让项目经理 Agent 在已批准目标内维护下一行动、进度、阻塞和角色交接，用户只负责每日启动、重要决策和成果确认。

### Success criteria

- 每日启动生成准确简报和推荐下一行动；
- 项目经理只能建议目标、范围和变更，不能代替用户批准；
- 任务完成后可在已批准目标内自动选择安全下一任务并调度角色；
- 按用户设置的间隔生成进度摘要，即使不需要审批也可报告；
- Blocker、问题、决策和范围变化会暂停受影响任务并升级给用户；
- 重启后从事实文件恢复项目经理状态，不依赖其会话；
- 多日临时项目验证用户无需人工复制交接内容。

### Non-goals

- 不自动选择用户每天应该推进哪个项目；不支持后台 7×24 小时运行；不并行执行任务。

## 11. V0.5：已有项目与通用项目模板

### Objective

在不破坏已有文件和 Git 历史的前提下导入现有项目，并用同一治理模型支持 Coding 与知识生产两类项目。

### Success criteria

- 已有项目先只读扫描、预览冲突和治理计划，用户批准后才初始化；
- 导入不覆盖现有 `README`、Agent 指令、规范、任务文件或 Git 历史；
- 项目类型与模板解耦，可选择 Coding 或知识生产模板；
- 模板可以定义工作流、角色、必读/按需材料、任务字段和审批门；
- 知识生产模板实现生产者、只读审核者、返工和同一审核者复审；
- Coding 模板复用现有分支、Worktree、测试和差异校验；
- 两类临时项目分别完成端到端 Dogfooding。

### Non-goals

- 不提供复杂可视化工作流设计器；不承诺任意项目零配置导入。

## 12. V0.6：多 Runtime Adapter 扩展层

### Objective

形成版本化、厂商无关的 Adapter SDK 和运行时注册机制，使 Claude Code、Codex、Fake 与通用 API Agent 共享同一治理、工具和验收边界。

### Success criteria

- Adapter 声明版本、认证、模型、结构化输出、会话、工具、取消和清理能力；
- Runtime 根据任务需求和用户设置选择 Adapter，能力不足时阻断并解释；
- 现有 Fake、Codex、Claude Adapter 迁移到统一 SDK 且能力不回退；
- 通用 HTTP API Adapter 支持结构化输入、事件、结果、超时、取消和错误；
- API Agent 通过受控工具网关读取/编辑允许文件和执行允许命令；
- 密钥只使用环境变量或外部秘密引用，项目中不保存内容；
- UI 可配置 Adapter、模型和超时并查看能力诊断；
- 临时项目验证至少 Fake、Claude 和 API 三种运行方式，Codex 在环境可用时加入真实验收。

### Non-goals

- 不实现桌面客户端自动控制、多 Agent 并行、远程执行集群或供应商计费管理。

## 13. Dependency and checkpoints

```text
GOAL-011 completed
  → GOAL-012 / V0.3
  → GOAL-013 / V0.4
  → GOAL-014 / V0.5
  → GOAL-015 / V0.6
```

- 每个目标必须先批准再把第一个任务改为 `ready`；
- 每项任务完成后独立验收，目标边界内可自动解锁下一任务；
- 每个版本最后生成检查点报告；未接受检查点不得启动下一版本；
- 任何版本失败均保留证据并停在当前边界，不回退已接受版本。

## 14. Risks and mitigations

- **规划 Agent 生成过量或错误任务**：先生成草案，使用 Schema、依赖和循环校验，用户统一批准后再写正式事实；
- **项目经理成为新的不可信状态源**：状态从正式事实重建，项目经理只生成建议和报告；
- **模板过度抽象**：先固定 Coding 与知识生产两个真实模板，再开放轻量定制；
- **已有项目导入破坏文件**：只读预览、冲突清单、批准门、基线提交和可恢复失败报告；
- **Adapter 能力差异泄漏到业务层**：使用版本化能力契约和统一结构化事件；
- **API 工具扩大本机风险**：根目录边界、允许路径/命令、差异校验、超时、取消和审计；
- **路线过长导致范围漂移**：每个版本独立批准和验收，后续草案可更新但不得提前实施。

## 15. Open questions deferred to goal approval

- V0.3 首个真实阶段运行使用 Claude Code 还是 Fake + Claude 双重验收；
- V0.4 进度报告默认间隔和手动触发入口；
- V0.5 模板可定制字段的首轮最小集合；
- V0.6 首个真实 API 供应商、兼容协议和用量上限。

这些问题不阻止路线规划，但必须在对应目标启动审批前确定。

## 16. Approval state

- 本路线 Spec、GOAL-012～015 和 TASK-055～084 均为 `draft`；
- 本次仅批准生成规划文件，不批准实现；
- 下一审批点为 GOAL-012 / V0.3，用户可先修改范围、任务或顺序。
