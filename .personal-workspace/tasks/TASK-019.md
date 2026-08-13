---
schema_version: 1
id: TASK-019
title: 实现项目创建向导界面
status: draft
goal_id: GOAL-004
role: executor
dependencies: [TASK-018]
revision: 1
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T12:29:07Z
---

# TASK-019：实现项目创建向导界面

## 目的与范围

提供选择目录、输入想法、查看预览、处理冲突和批准创建的中文 Web 向导。

## 验收条件

- 用户能区分预览和实际创建；
- 所有将写入的文件及 Git 动作可审核；
- 失败时保留输入并显示可执行的下一步。

## 验证

运行项目创建 Playwright 场景；`npm run build`。

## 预计文件

创建项目页面、表单 Schema、初始化 API Client、预览组件、E2E 测试。

## 边界与交接

不自动批准，不实现已有项目导入。完成后提交 GOAL-004 检查点。
