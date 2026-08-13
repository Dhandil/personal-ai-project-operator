---
schema_version: 1
id: TASK-038
title: 实现 Codex CLI 环境与沙箱能力检查
status: draft
goal_id: GOAL-008
role: executor
dependencies: [TASK-035]
revision: 1
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-13T12:29:07Z
---

# TASK-038：实现 Codex CLI 环境与沙箱能力检查

## 目的与范围

检测 Codex CLI 安装、版本、登录可用性、官方命令及 Windows 原生沙箱能力。

## 验收条件

- 缺失安装、登录或必要命令时阻止真实执行并给出操作建议；
- 优先 elevated，回退 unelevated 时显著提示；
- 检测结果带时间和版本，可供真实验收引用。

## 验证

模拟探测集成测试；本机条件允许时运行 `npm run test:codex-cli -- preflight`。

## 预计文件

Codex 进程探测器、能力模型、Windows 沙箱探测、诊断 Route、测试。

## 边界与交接

不得自动安装、登录或修改用户 Codex 配置。完成后交给 TASK-039、046。
