---
schema_version: 1
id: TASK-051
title: 增加本机项目目录选择器
status: completed
goal_id: GOAL-010
role: executor
dependencies: [TASK-050]
revision: 4
created_at: 2026-08-16T06:48:35Z
updated_at: 2026-08-16T08:18:00Z
approval_id: APPROVAL-005
target_branch: goal/GOAL-010
unblocked_by: TASK-050
verification_report_id: REPORT-055
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

## 完成证据

- 新增仅接受回环地址请求的 `/api/projects/select-directory` 接口，在 Windows 本机通过 PowerShell `FolderBrowserDialog` 返回已存在的目录；接口不接受路径参数，不读取所选目录内容。
- 创建向导新增“选择本机目录”按钮；选择结果只回填表单并进入既有只读预览，手动输入绝对路径继续作为回退；取消、平台不支持、选择器失败和无效目录均保留结构化错误。
- 选择目录专项：服务器 4/4、前端 5/5、Chromium 创建向导 1/1；完整 `npm run verify`：76 个单元测试、129 个集成测试、17 个 Playwright 测试，以及格式、Lint、类型检查和构建全部通过。

## Handoff

- TASK-051 已通过项目负责人独立验收，状态为 `completed`；REPORT-055 已接受。
- TASK-052 未执行、未修改，已按用户持续授权自动解锁为 `ready`。

## Acceptance

- 独立验收通过：服务器专项 4/4、前端专项 5/5、Chromium 创建向导场景 1/1。
- 验收范围仅覆盖 TASK-051；TASK-052 仅完成解锁，未开始执行。
