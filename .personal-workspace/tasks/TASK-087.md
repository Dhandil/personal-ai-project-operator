---
schema_version: 1
id: TASK-087
title: 修复本机目录选择器的完成与取消反馈
status: draft
goal_id: GOAL-016
role: executor
dependencies: [TASK-086]
revision: 1
created_at: 2026-08-17T08:51:22Z
updated_at: 2026-08-17T08:51:22Z
target_branch: goal/GOAL-016
unblocked_by: TASK-086
---

# TASK-087：修复本机目录选择器的完成与取消反馈

## 目的与范围

让新建项目中的“选择本机目录”在 Windows 桌面环境下明确处理成功、取消、权限失败和超时，避免按钮点击后页面无反馈。

## 验收条件

- 选择成功后路径回填表单，仍需经过只读预览；
- 用户取消不会报错，也不会修改表单以外的项目文件；
- 选择器启动失败、权限不足或超时都有可见错误和手动输入回退；
- 选择器接口不会无限等待；
- 回环地址限制和目录边界保护保持有效；
- Windows 本机人工验收至少覆盖成功和取消两条路径。

## 验证

运行目录选择器专项测试、前端 Chromium 场景、Windows 本机手工测试和完整 `npm run verify`。

## 边界与交接

不得在选择阶段创建项目、写入 registry 或初始化 Git；完成后交接给 TASK-088。

