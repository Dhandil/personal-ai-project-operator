---
schema_version: 1
id: TASK-080
title: 实现通用 HTTP API Adapter
status: draft
goal_id: GOAL-015
role: implementer
dependencies: [TASK-077, TASK-078]
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
target_branch: goal/GOAL-015
unblocked_by: TASK-078
---

# TASK-080：实现通用 HTTP API Adapter

## 目的与范围

提供首个厂商无关 API Adapter，发送结构化任务包并将响应映射为统一事件和结果。

## 验收条件

- 支持可配置 endpoint、模型、请求头密钥引用和超时；
- 输入包括角色任务包、结构化输出 Schema 与允许的工具能力；
- 支持流式或非流式响应、取消、超时、限流和服务错误分类；
- 非法 JSON、Schema 不匹配和部分响应不会被视为成功；
- API Adapter 不直接获得宿主文件系统权限。

## 验证

使用本地模拟 HTTP 服务覆盖成功、流式、超时、取消、限流和非法输出。

## 边界与交接

V0.6 不承诺适配所有厂商专有协议；先建立稳定通用边界。
