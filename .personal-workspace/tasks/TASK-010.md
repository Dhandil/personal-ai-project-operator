---
schema_version: 1
id: TASK-010
title: 实现 Markdown 与 YAML Front Matter 编解码
status: completed
goal_id: GOAL-003
role: executor
dependencies: [TASK-005, TASK-006, TASK-007, TASK-008, TASK-009]
revision: 4
created_at: 2026-08-13T12:29:07Z
updated_at: 2026-08-14T02:53:03Z
approval_id: APPROVAL-001
target_branch: goal/GOAL-001
unblocked_by: TASK-009
verification_report_id: REPORT-011
---

# TASK-010：实现 Markdown 与 YAML Front Matter 编解码

## 目的与范围

实现正式治理文档的解析、校验和序列化，保留未知 YAML 字段和 Markdown 正文。

## 验收条件

- UTF-8、LF 和 YAML/Markdown 往返稳定；
- 未知字段不丢失；
- Schema 错误返回结构化失败，不产生部分写入。

## 验证

`npm run test:integration -- governance-codec`。

## 预计文件

`apps/server/src/infrastructure/files/governance-codec.ts`、Schema 映射、测试夹具、集成测试及导出文件。

## 边界与交接

不得把 Markdown 解析逻辑放入 Domain。完成后交给 TASK-011。

## Completion

- Status: `completed`.
- Output: added the server infrastructure `governance-codec` for Markdown plus YAML Front Matter decoding and encoding.
- Format guarantees: accepts UTF-8 input, normalizes CRLF/CR to LF, and emits stable LF documents with a front matter delimiter and Markdown body.
- Unknown fields: decodes the complete YAML mapping and rewrites it without dropping unknown future fields.
- Schema failures: returns structured codec errors for invalid UTF-8, malformed YAML, missing front matter, invalid root documents, and schema validation failures; no partial write is performed.
- Boundary: parsing remains in `apps/server/src/infrastructure`; no Markdown/YAML logic was added to Domain.

## Verification evidence

- `npm run test:integration -- governance-codec`: 3 tests passed.
- `npm run verify`: format check, lint, all workspace type checks, 40 unit tests, 3 integration tests, 1 Playwright Chromium test, and all workspace builds passed.
- `git diff --check`: passed.

## Handoff

- TASK-011 was not implemented in this task.
