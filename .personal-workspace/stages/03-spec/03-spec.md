---
schema_version: 1
document_type: development_spec
project_name: 个人 AI 项目运营工具
stage: 03-spec
status: approved
revision: 2
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T13:40:49Z
supersedes_unconfirmed_content: true
source_documents:
  - ../01-idea/01-idea.md
  - ../02-discovery/02-discovery.md
---

# 个人 AI 项目运营工具：正式开发 Spec

## 1. 文档目的与事实优先级

本文档是在 `idea-refine` 与 `discovery-process` 两个阶段产物基础上，经用户逐项确认形成的正式开发规格。它定义当前要建设什么、为什么建设、如何实现、如何验证以及哪些事情不能做。

事实优先级如下：

1. 本文档记录的已确认结论；
2. `02-discovery.md` 中未被本文档修正的已确认发现；
3. `01-idea.md` 中未被后续阶段修正的方向与假设；
4. 历史聊天只作为补充背景，不是正式事实源。

需求或技术决策发生变化时，必须先讨论、由用户决定是否批准，再更新本文档及受影响的正式记录。不得通过实现结果反向篡改规格。

## 2. Objective

### 2.1 要解决的问题

当个人使用多个对话、角色和 AI Agent 推进项目时，项目状态、当前任务、角色职责、执行进度和下一步容易依赖某个聊天上下文或用户记忆。拆分角色会增加人工交接，不拆分角色又会导致职责混合和状态困在长对话中。

本项目要让项目连续性属于项目本身，而不是属于某个对话；让不同 Agent 能根据持久化项目事实正确接手、执行、审核和交接，不再由用户反复复制提示词、搬运上下文或手工推动生产—审核—返工—复审。

### 2.2 产品定义

产品名称：**个人 AI 项目运营工具**。

它是未来“个人 AI 工作站”中的项目运营能力，但当前作为独立项目建设。它不是完整个人工作站，也不是企业项目管理系统。

### 2.3 目标用户

当前只有项目创建者本人，是单用户、本地使用、用于练手并实际使用的产品。用户是 Boss 和最终决策者：提出想法、审批短期目标与执行边界、决定产品范围和关键技术取舍、验收阶段成果。

### 2.4 核心结果

用户每天主动选择并启动项目。系统生成当前简报，项目负责人角色提出下一短期目标；用户批准后，Agent 在获批边界内连续执行、审核、返工、复审和交接。用户持续看见进度，但不需要批准每一个细粒度步骤。

新的 Agent 不依赖前一个 Agent 的聊天历史，只通过项目事实、角色任务包、实际项目文件、Git 变化和标准交接继续工作。

## 3. 版本范围

### 3.1 V0：项目治理雏形

V0 只支持新项目，提供：

- 选择目录、输入想法、预览并批准项目初始化；
- 项目工作流、阶段和跳过标记；
- 短期目标、角色、任务、审批、问题、决策、交接、报告和审计记录；
- 项目启动简报、当前状态、进度、风险、下一步和用户待办；
- Markdown/YAML 项目事实层与中央项目索引；
- 外部修改检测、冲突处理、重启恢复和历史查看；
- 使用模拟 Agent 验证成功、失败、中断、越权及审核不通过；
- 使用本项目管理本项目的 Dogfooding。

V0 不调度真实 Agent 修改项目。

### 3.2 V0.2：Codex CLI 调度验证

V0.2 增加：

- 每个短期目标的目标分支；
- 每个任务的独立分支和 Git Worktree；
- Codex CLI 执行者与只读审核者；
- JSONL 实时事件、结构化执行结果和周期摘要；
- 实际成果、允许路径、Git 差异、命令、测试和证据校验；
- 执行—审核—返工—同一审核者复审—验收—提交—交接闭环；
- 目标边界内自动推进下一任务；
- 中断恢复、会话续接、取消和完成后清理；
- 用户批准后才将目标分支合入 `main`。

### 3.3 明确不在当前范围

- 已有项目导入；
- 登录、账号、多用户、企业级权限或云部署；
- 完整知识生产专用模板；
- 多项目或多任务并发执行；
- Claude Code、其他 CLI、通用 API 或桌面客户端 Adapter；
- Electron、Tauri、安装包、Windows 服务或开机自启；
- Calendar、Notes、Obsidian、GitHub、邮箱、浏览器等工作站集成；
- 自定义复杂工作流设计器、复杂表单设计器或自定义审批门；
- 自动决定用户每天应该推进哪个项目；
- 7×24 小时无人值守运行。

上述项目可以作为后续候选，不能在首轮实现中提前加入。

## 4. 产品行为规格

### 4.1 新项目初始化

1. 用户选择一个新项目目录并输入项目想法。
2. 系统只读检查目录、现有文件和 Git 状态。
3. 系统展示将创建的治理文件、默认工作流、角色、Git 初始化和基线提交预览。
4. 未经用户批准不得写文件或执行 Git 初始化。
5. 批准后，系统创建 `.personal-workspace`、初始化或沿用 Git，并生成首个治理基线提交。
6. 所有 Git 操作结果和异常均需记录。

### 4.2 默认项目前期流程

默认流程为：

```text
想法澄清
→ 问题定义
→ 用户场景
→ Discovery 验证
→ 产品需求
→ MVP 范围
→ 系统方案
→ 开发计划
→ 第一个短期目标
→ 执行
```

除 Discovery 外，早期步骤通常较轻，不默认跳过。材料充分时，项目负责人可以说明建议从哪里开始、缺失内容及风险，由用户决定是否跳过；被跳过阶段必须保存 `skipped` 状态和理由。Discovery 允许用户明确批准跳过。

### 4.3 审批门

V0 固定五类审批门：

1. 项目定义；
2. 产品范围；
3. 技术方案；
4. 短期目标启动；
5. 短期目标验收及合入 `main`。

是否审批按风险、范围变化和承诺程度判断，不按步骤数量判断。自定义审批门是后期功能。

### 4.4 每日启动与项目简报

用户每天主动选择并启动项目。简报至少包含：

- 项目目标；
- 当前获批的短期目标；
- 已完成成果；
- 当前任务及责任角色，只显示任务简介；
- Blocker、风险和待决策事项；
- 上一小步做了什么；
- 推荐下一步；
- 是否需要用户操作。

字段可根据 Dogfooding 调整，但任何调整必须经过讨论和用户决定。

### 4.5 短期目标

- 项目负责人 Agent 提供目标建议、边界、风险、验收条件和任务草案。
- 用户可以批准、修改或拒绝。
- 未获批目标不得开始执行。
- 获批后，边界内任务可以连续推进，无需逐任务请求批准。
- 出现超出目标边界、重大范围变化、新架构承诺、真实 Blocker 或高风险操作时，必须暂停受影响执行链并请求用户决策。

### 4.6 角色与 Agent

角色表示稳定职责，不绑定具体 Agent 产品或会话。V0 提供可编辑模板：

- 项目负责人；
- 产品/需求角色；
- 架构师；
- 执行者；
- 审核者。

角色定义至少包含职责、必须读取、按需读取、允许动作、禁止动作和交接要求。Agent Runtime 只负责把某个可替换 Agent 装配到角色。

### 4.7 任务卡

正式任务卡至少包含：

- 元数据：ID、标题、状态、目标、当前角色、依赖；
- 任务目的、范围、输出和验收条件；
- 必读、按需读文件及关联决策；
- 允许和禁止的路径与动作；
- 运行方式、Git 分支、Worktree、验证命令和证据；
- 完成输出、测试结果、提交、遗留问题和交接。

任务卡支持轻量自定义字段：文本、数字、布尔、日期、单选和文件引用。系统必填字段不可删除；可选字段可以隐藏或留空；未知 YAML 字段必须保留。复杂表单设计器不进入 V0。

### 4.8 状态模型

正常状态：

```text
draft → ready → in_progress → in_review → completed
```

异常或控制状态：

```text
blocked | changes_requested | paused | cancelled
```

状态变化必须满足领域规则并留下审计。后续可以根据实际使用增加或删除状态，但必须由用户批准并先更新 Spec。

### 4.9 执行与审核

- 一张交付任务卡包含执行者、可选审核者和当前角色。
- 执行者完成实际项目变更并提交结构化结果。
- 审核者只能读取项目并生成审核报告，不能修改正式项目文件。
- 审核不通过时任务进入 `changes_requested`，交还执行者修正。
- 修正后由同一审核者复审。
- 只有审核者本身被明确安排为新修改任务的执行者时，才可以获得写权限。

任务完成不能只依据 Agent 的文字声明。必须验证实际产物、允许路径、Git 差异、要求的命令和测试、证据、未解决违规以及必要审核。

### 4.10 问题、变更与决策

用户可以随时提出问题。系统先暂停明确受影响的任务；如果影响范围无法判断，则暂停当前执行链。Agent 分析影响和可选方案，由用户决定是否修改范围、方案或任务。

问题、讨论、决定、受影响对象和恢复方式都必须保留。未受影响的事实不得因一个问题而被整体回滚。

### 4.11 进度和报告

- 执行事件实时展示；
- 完成、阻塞、越权、失败、恢复及需要决策时立即记录；
- 长时间执行默认每 10 分钟生成一次摘要；
- 摘要间隔支持全局默认和项目覆盖；
- 每次执行结束生成成果、验证、问题和交接摘要；
- 报告必须引用实际项目证据，不能以 Agent 自述代替事实。

### 4.12 Git 规则

- Commit 格式：`<type>(<scope>): <description>`；
- `type` 与 `scope` 使用英文；
- `description` 默认中文，项目可统一覆盖为英文；同一项目必须一致；
- Commit 正文包含 `Tasks: TASK-012` 形式的任务引用；
- 默认一个验收通过的任务对应一个 Commit；同目标、同区域、同审核且均通过的简单任务可以合并提交；
- 一个目标对应目标分支，一个任务对应独立分支和 Worktree；
- 任务验收后自动提交并合并到目标分支；
- 目标分支合入 `main` 必须由用户批准；
- 禁止 force push、历史重写、绕过隔离或未经批准直接修改 `main`。

## 5. 持久化与事实模型

### 5.1 项目内事实

每个受管项目以自身的 `.personal-workspace/` 保存正式事实。中央数据库不重复保存任务、进度或决策等动态事实，只保存项目索引、设置和可重建缓存。

`status.md` 是由领域事实自动生成的唯一当前摘要，不是独立事实源。发生冲突时重新生成 `status.md`，绝不反向覆盖领域事实。

### 5.2 文件协议

- Markdown 正文加 YAML Front Matter；
- UTF-8、LF；
- 必须包含 `schema_version`、`revision` 和 UTC ISO 时间；
- 内容哈希用于外部修改检测；
- 采用临时文件替换的原子写入；
- 每项目串行写入队列；
- 读取和重写时保留未知 YAML 字段；
- `audit/events.jsonl` 是只追加的例外文件。

### 5.3 ID

正式 ID 不可变并按类型递增：

```text
GOAL-001
TASK-001
DEC-001
HANDOFF-001
REPORT-001
EXEC-001
```

### 5.4 正式目录

```text
.personal-workspace/
├── project.md
├── workflow.md
├── status.md
├── stages/
│   ├── 01-idea/01-idea.md
│   ├── 02-discovery/02-discovery.md
│   └── 03-spec/03-spec.md
├── goals/
├── tasks/
├── roles/
├── approvals/
├── issues/
├── decisions/
├── handoffs/
├── reports/
├── executions/
└── audit/events.jsonl
```

每个阶段只有一个主产物，可按需增加 `evidence/`、`diagrams/` 等支持目录；不预建空目录，不默认保存被否决的临时讨论。

### 5.5 Skill 兼容入口

- `.personal-workspace/tasks/TASK-xxx.md` 是唯一任务事实源；
- `tasks/plan.md` 只引用本 Spec 的实施计划；
- `tasks/todo.md` 是由正式任务卡生成的只读清单；
- 在工作台具备自动生成能力前，由 Agent 在正式任务卡变化后重建兼容视图；
- 禁止直接在 `tasks/todo.md` 修改任务状态。

## 6. Tech Stack

### 6.1 总体形态

Windows 11 本地优先的浏览器 Web 应用，采用模块化单体：

```text
React Web
    ↓ REST + SSE
Fastify Application
    ↓
Application Services
    ↓
Domain Core
    ↓ Ports
File / SQLite / Git / Agent Runtime Adapters
                              ↓
                        Codex CLI Adapter
```

Domain 不依赖 React、Fastify、文件系统、Git 或 Codex；Application 依赖抽象端口；Infrastructure 实现文件、SQLite、Git 和 Agent Adapter；Web 只能通过 HTTP/SSE 访问后端。

### 6.2 语言与依赖

- Node.js 24 LTS；
- TypeScript 5.9.x，ESM；
- React 19.2.x；
- Vite 8.x；
- Fastify 5.x；
- npm Workspaces 与锁定的 `package-lock.json`；
- Tailwind CSS 与 shadcn/ui；
- React Router、TanStack Query、React Hook Form、Zod；
- YAML、Chokidar、Execa、better-sqlite3 12.x、Pino；
- Vitest 4.x；
- Playwright 1.62.x，V0 仅 Chromium。

不使用 Redux、ORM、Python 后端、Electron 或 Tauri。未来如某个 Adapter 确实需要 Python，再单独决策。

### 6.3 内部名称

- 仓库名：`personal-ai-project-operator`；
- 包名：`@personal-ai-operator/web`、`server`、`domain`、`contracts`；
- 本地数据目录：`%LOCALAPPDATA%\PersonalAIProjectOperator\`；
- UI 名称：个人 AI 项目运营工具；
- V0 仅提供中文界面，字符串集中管理，为未来国际化留入口，但不提供语言切换。

### 6.4 本地运行

- 开发：Vite 默认 `5173`，Fastify 默认 `4300`；
- 生产：Fastify 在 `4300` 提供 API、SSE 和构建后的 React；
- 端口占用时选择下一个可用端口并打开实际地址；
- 只绑定 `127.0.0.1`；
- 关闭浏览器不停止后端或 Agent；
- 后端停止或掉电时尝试终止子进程、标记中断并保留恢复信息；
- 重启后先协调中断状态并生成恢复报告，用户决定继续、重新执行或取消；
- 恢复未处理前不得启动下一任务。

### 6.5 中央运行目录

```text
%LOCALAPPDATA%\PersonalAIProjectOperator\
├── app.db
├── cache/
├── logs/
└── runtime/
    ├── worktrees/
    └── executions/
```

Worktree 和执行临时文件可清理；正式项目事实始终留在项目目录。

## 7. Codex CLI Adapter

V0.2 首个 Adapter 使用官方非交互接口：

- `codex exec` 启动任务；
- `--json` 获取 JSONL 事件；
- `--output-schema` 约束最终结构化结果；
- `--cd` 指向任务 Worktree；
- 执行者使用 `--sandbox workspace-write`；
- 审核者使用 `--sandbox read-only`；
- 一次性任务使用 `--ephemeral`，不保存 rollout；
- 可能中断并续接的任务保存返回的精确 `thread_id`；
- 使用 `codex exec resume <SESSION_ID>` 续接，不使用含糊的 `--last`；
- 完成或取消后使用 `codex delete <UUID> --force` 清理保存会话；
- 清理失败记为 `cleanup_failed` 并允许重试，禁止直接解析或编辑 Codex 内部会话文件。

首轮正式基线为 Windows 11 原生模式，优先 `elevated` 沙箱；无法使用时可以回退 `unelevated`，但必须在执行前提示隔离能力降低。Windows 10 与 WSL 只作为后续兼容项。

`app-server` 不进入首轮实现。具体安装版本、登录状态、JSONL 字段和保存会话清理能力必须通过真实 `test:codex-cli` 验收，不能以文档假设代替实测。

## 8. Commands

```text
安装开发依赖：npm install
按锁文件安装：npm ci
开发运行：npm run dev
生产构建：npm run build
生产启动：npm start
类型检查：npm run typecheck
代码检查：npm run lint
自动修复检查：npm run lint:fix
格式检查：npm run format:check
自动格式化：npm run format
单元测试：npm run test:unit
集成测试：npm run test:integration
覆盖率测试：npm run test:coverage
端到端测试：npm run test:e2e
数据库迁移：npm run db:migrate
完整验证：npm run verify
真实 Codex CLI 验收：npm run test:codex-cli
```

`npm run verify` 固定顺序：

```text
format:check → lint → typecheck → test:unit → test:integration → test:e2e → build
```

`test:codex-cli` 不属于日常 `verify`，只在 V0.2 验收、Adapter 变更或用户明确要求时执行，因为它依赖本机安装、登录、真实进程和用量。

## 9. Project Structure

```text
personal-ai-project-operator/
├── .personal-workspace/        # 本项目管理自身的正式治理事实
├── apps/
│   ├── web/src/
│   │   ├── app/
│   │   ├── features/
│   │   ├── components/
│   │   └── lib/
│   └── server/src/
│       ├── modules/
│       ├── infrastructure/
│       └── bootstrap/
├── packages/
│   ├── domain/                 # 纯领域模型与规则
│   └── contracts/              # 前后端共享契约
├── e2e/
├── scripts/
├── test-fixtures/              # 仅用于临时测试项目
├── tasks/
│   ├── plan.md                 # Skill 兼容入口
│   └── todo.md                 # 任务卡生成视图
├── package.json
└── package-lock.json
```

测试不得使用真实个人项目目录，必须使用临时目录或 `test-fixtures`。

## 10. Code Style

### 10.1 规则

- TypeScript 启用 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`；
- 文件名使用 kebab-case；
- 组件和类型使用 PascalCase；
- 函数和变量使用 camelCase；
- 常量使用 UPPER_SNAKE_CASE；
- 不使用 `I` 前缀接口；
- 使用命名导出，公共函数写明返回类型；
- 禁止 `any` 和无理由的非空断言；
- 预期失败使用可辨识联合，异常仅表示非预期错误；
- 领域对象优先不可变；
- 时间统一使用 UTC ISO 字符串；
- 注释解释“为什么”，不复述代码“做什么”。

### 10.2 示例

```ts
export type CompletionDecision =
  | { readonly accepted: true }
  | {
      readonly accepted: false;
      readonly reasons: readonly string[];
    };

export function evaluateTaskCompletion(
  evidence: TaskCompletionEvidence,
): CompletionDecision {
  const reasons = [
    ...validateAllowedPaths(evidence.changedPaths),
    ...validateRequiredChecks(evidence.checks),
    ...validateReview(evidence.review),
  ];

  return reasons.length === 0
    ? { accepted: true }
    : { accepted: false, reasons };
}
```

## 11. Testing Strategy

### 11.1 单元测试

使用 Vitest 覆盖：

- 工作流、阶段、审批门、目标、任务和角色状态；
- 只读审核、路径边界、提交规则和完成判定；
- 自定义字段、时间、ID、Schema 和状态投影；
- 所有关键规则的成功、失败和边界分支。

Domain 行、函数和语句覆盖率不低于 90%，分支不低于 85%。其他代码整体覆盖率不低于 80%，分支不低于 75%。

### 11.2 集成测试

使用临时目录和临时 Git 仓库覆盖：

- 治理目录初始化和 YAML 未知字段往返；
- 原子写入、revision、哈希和外部冲突；
- SQLite 迁移与索引重建；
- Git 分支、Worktree、Commit 和 Merge；
- 允许路径、SSE、会话与临时文件清理；
- 模拟 Agent 的成功、失败、中断、越权、审核失败、错误输出和清理失败。

### 11.3 端到端测试

使用 Playwright Chromium 和临时项目，验证新项目初始化、治理闭环、重启恢复、冲突处理、目标审批、任务管理及执行界面。禁止对真实项目执行 E2E。

### 11.4 真实 CLI 验收

`test:codex-cli` 验证：

- 安装、版本、登录和沙箱能力；
- JSONL 事件和结构化输出；
- 工作目录和写入边界；
- 实际 Git 差异；
- 只读审核；
- 精确会话续接和官方删除清理。

模拟结果不能替代真实 CLI 验收。

## 12. Boundaries

### 12.1 Always do

- 执行前读取当前 Spec、任务卡、角色、相关决策和必读文件；
- 校验所有外部输入；
- 写入时检查 revision 和内容哈希；
- 执行前后检查 Git 状态、差异和允许路径；
- 运行任务要求的测试和验证；
- 保存实际成果、验证证据、状态、报告、交接和审计；
- 测试只使用临时项目；
- 修改需求或架构前先更新正式决策与 Spec。

### 12.2 Ask first

除非已批准目标和任务明确包含，否则以下行为必须先询问用户：

- 改变已确认范围、架构或治理规则；
- 增加新的运行时依赖；
- 改变 Schema、状态模型、审批门、角色权限或自动推进条件；
- 执行不可逆迁移；
- 访问项目外目录；
- 使用网络或外部服务；
- 将目标分支合入 `main`。

### 12.3 Never do

- 保存或提交密钥、Token 和凭据；
- 静默覆盖外部修改或冲突；
- 仅凭 Agent 声明将任务标记完成；
- 让审核者修改正式产物；
- 绕过 Worktree、任务分支、验收或主分支审批；
- force push、重写历史或删除未知文件；
- 修改任务范围外文件；
- 解析或直接编辑 Codex 内部会话文件；
- 用真实个人项目运行测试；
- 只在中央数据库保存项目动态事实；
- 通过模拟点击桌面客户端实现 Adapter；
- 擅自加入未确认需求。

## 13. Implementation Plan

### 13.1 实施顺序

```text
工程骨架
→ 治理领域模型
→ 文件事实层
→ 新项目初始化
→ V0 治理闭环
→ V0 验收与自举
→ Git 执行隔离
→ Codex CLI Adapter
→ 自动执行、审核与交接
→ V0.2 验收
```

共拆分为 9 个短期目标、47 个任务。正式目标位于 `.personal-workspace/goals/`，正式任务卡位于 `.personal-workspace/tasks/`。

### 13.2 顺序与并行

必须顺序完成：

- Domain → Application → Infrastructure；
- 文件协议 → 后端 API → 正式 Web 流程；
- Git 隔离 → Codex 写入执行；
- 实际结果校验 → 自动 Commit 与 Merge；
- 模拟 Agent 验证 → 真实 Codex CLI 验证。

接口稳定后可以有限并行：Web 页面框架与文件 Adapter、Git Adapter 与 Codex 事件解析器、实现与对应测试。V0.2 运行时仍只允许一个全局 Agent 执行链。

### 13.3 阶段检查点

每个 GOAL 完成后执行对应任务中的专项验证及 `npm run verify`，保留成果和证据，并按风险决定是否需要用户验收。V0 和 V0.2 完成时必须由用户验收。

## 14. Definition of Done

每个任务只有同时满足以下条件才算完成：

- 任务专属验收条件全部满足；
- 新行为有能证明其作用的测试，既有测试无回归；
- 格式、Lint、类型检查通过；
- 实际运行行为经过验证，而不只是编译通过；
- 边界和错误路径得到处理；
- 没有无关重构、重复逻辑、死代码或调试输出；
- 公共接口、用户行为和需要保留的架构决定已记录；
- 实际成果、状态、验证证据和审计已更新；
- 必要审核和用户审批已通过；
- Commit 符合统一规范。

## 15. Success Criteria

### 15.1 V0

- 用户可选择目录和想法，审核预览后创建新项目；
- 工作流、阶段、跳过状态和五类审批门可用；
- 可管理目标、角色、任务、审批、问题、决策、报告和交接；
- 启动简报准确展示当前状态、成果、风险、下一步和用户操作；
- 应用关闭或中央数据库丢失后，可从项目文件恢复；
- 外部修改不会被静默覆盖；
- 模拟 Agent 可验证成功、失败、中断、越权及审核不通过；
- 本项目可以使用自己的治理文件继续开发。

### 15.2 V0.2

- 用户选择已获批任务后，系统创建独立 Worktree 和角色任务包；
- 执行者能修改允许范围，审核者只能读取并生成报告；
- 实时事件和周期摘要可见；
- 系统实际校验成果、差异、命令、测试和证据；
- 审核失败后自动交还执行者，并由同一审核者复审；
- 目标边界内可自动推进下一任务；
- 验收任务按规范 Commit 并合入目标分支；
- `main` Merge 必须用户批准；
- 中断后先恢复和报告，不误启下一任务；
- 完成或取消后按规则清理 CLI 会话和临时运行文件；
- 新 Agent 不使用前一 Agent 聊天历史也能正确继续。

## 16. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 形成第二套过期状态系统 | 高 | 项目文件为事实源，`status.md` 只生成，实际产物和 Git 参与校验 |
| Agent 忘记更新状态 | 高 | 后端确定性检查成果、差异、测试和证据，不信任自述 |
| 审核者越权修改 | 高 | 只读沙箱、独立角色、路径检查、Git 校验和审计 |
| 外部修改冲突 | 高 | revision、哈希、原子写入、写入队列和用户选择 |
| Codex CLI 版本行为变化 | 中 | 启动前能力检查、稳定接口封装和真实 Adapter 验收 |
| Windows 沙箱降级 | 中 | 优先 elevated；回退时显著提示并保留记录 |
| 元系统维护成本过高 | 中 | 先 V0 治理闭环，再接真实 Agent；不提前扩展平台 |
| 首轮范围膨胀 | 高 | 严格执行非目标和 Ask first 边界 |

## 17. Open Questions

当前没有阻止 V0 或 V0.2 开发的未决问题。以下内容仅作为后续候选，不属于当前承诺：

- 何时支持已有项目导入；
- 是否增加知识生产专用工作流；
- 如何扩展 Claude Code、其他 CLI、API 和桌面客户端 Adapter；
- 是否支持并行 Agent 执行链；
- 是否加入复杂自定义任务表单、工作流和审批门；
- 是否最终并入更大的个人 AI 工作站。

任何候选进入范围前，必须先由用户批准并更新本文档。

## 18. 当前批准状态

- SPECIFY：已批准；
- PLAN：已批准；
- TASKS：已批准；
- IMPLEMENT：已批准在 GOAL-001 范围内实施 TASK-001～TASK-004；
- GOAL-001 已启动，TASK-001 已就绪；后续任务仍须满足依赖和状态转换规则；
- GOAL-002～GOAL-009 仍为 `draft`，不得提前实施；
- 本次授权不允许扩大 GOAL-001 的目标、依赖、技术范围或验收条件。
