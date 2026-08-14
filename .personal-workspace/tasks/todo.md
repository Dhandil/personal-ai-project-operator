# Task List：个人 AI 项目运营工具

> 本文件由 `.personal-workspace/tasks/TASK-xxx.md` 正式任务卡生成。
> 禁止在本文件中独立修改状态；正式状态以任务卡为准。
> 生成时间：2026-08-14T13:33:42.399Z

## GOAL-001：建立可运行工程

- [x] TASK-001 建立 npm Workspace 和 TypeScript 根配置
- [x] TASK-002 建立 Fastify 后端骨架和健康检查
- [x] TASK-003 建立 React Vite 和中文界面骨架
- [x] TASK-004 配置格式 Lint 类型检查和测试命令

## GOAL-002：建立治理领域模型

- [x] TASK-005 定义 ID 状态时间和共享数据契约
- [x] TASK-006 实现项目工作流和阶段模型
- [x] TASK-007 实现短期目标角色和任务卡模型
- [x] TASK-008 实现审批问题决策和交接模型
- [x] TASK-009 实现状态转换审批门和完成判定策略

## GOAL-003：建立文件事实层

- [x] TASK-010 实现 Markdown 与 YAML Front Matter 编解码
- [x] TASK-011 实现原子写入 revision 哈希和项目写入队列
- [x] TASK-012 实现追加式审计事件记录
- [x] TASK-013 从领域事实生成唯一 status.md 快照
- [x] TASK-014 实现外部修改检测和冲突处理入口
- [x] TASK-015 实现 SQLite 项目索引和迁移

## GOAL-004：完成新项目初始化

- [x] TASK-016 实现 Git 仓库检测初始化和基线提交能力
- [x] TASK-017 实现项目初始化预览
- [x] TASK-018 实现用户批准后的项目创建
- [x] TASK-019 实现项目创建向导界面

## GOAL-005：完成 V0 治理闭环

- [x] TASK-020 实现项目登记列表选择和每日启动
- [x] TASK-021 实现项目总览和推荐下一步界面
- [x] TASK-022 实现工作流阶段和跳过建议
- [x] TASK-023 实现短期目标和目标启动审批
- [x] TASK-024 实现角色模板和上下文读取规则
- [x] TASK-025 Implement task card dependencies and lightweight custom fields
- [x] TASK-026 Implement issues, discussions, decisions, and affected-task pausing
- [x] TASK-027 实现审批记录和目标验收
- [x] TASK-028 Implement real-time events, execution reports, and summary interval settings

## GOAL-006：完成 V0 验收与自举

- [x] TASK-029 实现重启恢复索引重建和历史查看
- [x] TASK-030 完成 V0 浏览器端到端测试
- [ ] TASK-031 使用本项目治理本项目

## GOAL-007：建立 Git 执行隔离

- [x] TASK-032 实现目标分支任务分支和 Worktree 生命周期
- [x] TASK-033 实现差异允许路径和禁止动作校验（completed）
- [ ] TASK-034 实现规范提交目标分支合并和主分支审批门（in_review）

## GOAL-008：接入 Codex CLI

- [ ] TASK-035 定义 Agent Runtime 接口和模拟 Adapter
- [x] TASK-036 实现单执行链协调器
- [x] TASK-037 生成角色任务包和结构化输出 Schema
- [ ] TASK-038 实现 Codex CLI 环境与沙箱能力检查
- [ ] TASK-039 实现 codex exec 启动及 JSONL 事件解析
- [ ] TASK-040 实现续接取消中断标记和恢复报告
- [ ] TASK-041 实现临时会话和官方删除清理

## GOAL-009：完成自动执行审核和交接

- [ ] TASK-042 实现执行成果差异测试和证据校验
- [ ] TASK-043 实现只读审核及结构化审核报告
- [ ] TASK-044 实现返工同一审核者复审和自动下一任务
- [ ] TASK-045 实现执行控制台进度摘要和恢复决策界面
- [ ] TASK-046 完成真实 Codex CLI Adapter 验收
- [ ] TASK-047 完成 V0.2 全链路验收
