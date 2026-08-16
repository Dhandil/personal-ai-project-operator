---
schema_version: 1
id: TASK-051
title: 增加本机项目目录选择器
status: draft
goal_id: GOAL-010
role: executor
dependencies: [TASK-050]
revision: 1
created_at: 2026-08-16T06:48:35Z
updated_at: 2026-08-16T06:48:35Z
approval_id: APPROVAL-005
target_branch: goal/GOAL-010
unblocked_by: TASK-050
---

# TASK-051：增加本机项目目录选择器

## 目的与范围

为本地新建项目流程提供 Windows 目录选择体验，减少手动输入绝对路径的负担，同时保留明确、安全的回退方式。

## 验收条件

- 用户可点击按钮打开本机目录选择器并选择项目根目录；
- 选择结果进入既有只读预览，未经批准不得创建文件、注册项目或初始化 Git；
- 仍允许手动输入路径作为回退；
- 取消选择不会产生副作用；
- 路径不存在、无权限、冲突和预览过期继续返回结构化错误；
- 目录选择接口仅服务本机用户，不接受远程任意调用；
- 补充 Windows 路径、取消、错误和成功场景测试。

## 边界与交接

- 不读取所选目录之外的内容；
- 不因选择目录自动批准项目初始化；
- 完成并验收后再执行 TASK-052。
