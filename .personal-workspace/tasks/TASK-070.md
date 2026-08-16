---
schema_version: 1
id: TASK-070
title: 实现已有项目只读扫描与导入预览
status: draft
goal_id: GOAL-014
role: implementer
dependencies: [TASK-069]
revision: 1
created_at: 2026-08-16T14:00:00Z
updated_at: 2026-08-16T14:00:00Z
target_branch: goal/GOAL-014
unblocked_by: TASK-069
---

# TASK-070：实现已有项目只读扫描与导入预览

## 目的与范围

在不修改目标目录的前提下识别已有项目的 Git、目录、技术线索及治理冲突，并生成可审核的导入预览。

## 验收条件

- 用户通过目录选择器或手动路径选择已有项目；
- 扫描阶段不创建、修改或删除项目文件，不初始化 Git；
- 展示将新增的治理文件、模板建议、冲突、风险和不可识别项；
- 区分无 Git、正常 Git、异常 Git 与已存在治理目录；
- 预览具有指纹，目录变化后旧预览不可执行。

## 验证

使用临时目录覆盖多种已有项目形态并运行完整 `npm run verify`。

## 边界与交接

不得自动决定项目模板，不读取凭据或项目目录之外的文件。
