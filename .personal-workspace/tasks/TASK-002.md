---
schema_version: 1
id: TASK-002
title: 建立 Fastify 后端骨架和健康检查
status: ready
goal_id: GOAL-001
role: executor
dependencies: [TASK-001]
revision: 2
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T13:59:41Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-001
---

# TASK-002：建立 Fastify 后端骨架和健康检查

## 目的与范围

建立可启动、只绑定本机地址的 Fastify 应用，并提供无业务依赖的健康检查。

## 验收条件

- 默认监听 `127.0.0.1:4300`；
- 健康接口返回稳定结构；
- 应用构造与进程启动分离，便于测试。

## 验证

运行后端专项集成测试并手工请求健康接口。

## 预计文件

`apps/server/package.json`、`apps/server/tsconfig.json`、`apps/server/src/app.ts`、`apps/server/src/main.ts`、对应测试。

## 边界与交接

不加入业务模块、数据库或静态前端服务。完成后为 TASK-003、004 提供后端入口。
