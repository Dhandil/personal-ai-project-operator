---
schema_version: 1
id: TASK-003
title: 建立 React Vite 和中文界面骨架
status: draft
goal_id: GOAL-001
role: executor
dependencies: [TASK-001, TASK-002]
revision: 1
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T12:29:07Z
---

# TASK-003：建立 React、Vite 和中文界面骨架

## 目的与范围

建立 React/Vite Web 入口、基础路由和集中中文字符串，并验证能连接健康接口。

## 验收条件

- 开发首页可以打开并显示中文产品名；
- Web 通过 HTTP 调用后端健康接口；
- 生产构建成功。

## 验证

`npm run build`；手工打开首页并确认健康状态。

## 预计文件

`apps/web/package.json`、`apps/web/tsconfig.json`、`apps/web/vite.config.ts`、`apps/web/index.html`、`apps/web/src/main.tsx`。

## 边界与交接

不实现正式功能页面或全局复杂状态。完成后交给 TASK-004。
