import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import type {
  ExecutionId,
  FormalId,
  UtcIsoTimestamp,
} from "@personal-ai-operator/contracts";

import { createAuditEvent, type AuditEvent } from "../audit/audit-event.js";
import {
  AuditLogRepository,
  type AuditLogRepositoryResult,
} from "../audit/audit-log-repository.js";
import { sha256Content } from "../files/content-hash.js";
import { GitBootstrapService } from "./git-bootstrap.js";
import { GitProcess, type GitCommandResult } from "./git-process.js";

export type GitChangeKind =
  "added" | "modified" | "deleted" | "renamed" | "copied" | "untracked";

export type GitChangeEntry = Readonly<{
  readonly path: string;
  readonly previousPath: string | null;
  readonly kind: GitChangeKind;
  readonly indexStatus: string;
  readonly worktreeStatus: string;
  readonly contentHash: string | null;
}>;

export type GitChangeSnapshot = Readonly<{
  readonly projectRoot: string;
  readonly head: string;
  readonly branch: string | null;
  readonly entries: readonly GitChangeEntry[];
}>;

export type GitBoundaryPolicy = Readonly<{
  readonly allowedPaths: readonly string[];
  readonly forbiddenPaths: readonly string[];
  readonly forbiddenActions?: readonly string[];
}>;

export type GitBoundaryRequest = Readonly<{
  readonly before: GitChangeSnapshot;
  readonly after: GitChangeSnapshot;
  readonly policy: GitBoundaryPolicy;
  readonly actions?: readonly string[];
}>;

export type GitBoundaryViolationCode =
  | "invalid_path"
  | "path_not_allowed"
  | "forbidden_path"
  | "forbidden_action"
  | "head_changed"
  | "branch_changed";

export type GitBoundaryViolation = Readonly<{
  readonly code: GitBoundaryViolationCode;
  readonly path?: string;
  readonly action?: string;
  readonly message: string;
}>;

export type GitBoundaryReport = Readonly<{
  readonly passed: boolean;
  readonly changes: readonly GitChangeEntry[];
  readonly violations: readonly GitBoundaryViolation[];
  readonly beforeHead: string;
  readonly afterHead: string;
  readonly beforeBranch: string | null;
  readonly afterBranch: string | null;
}>;

export type GitBoundaryAuditContext = Readonly<{
  readonly executionId: ExecutionId;
  readonly occurredAt: UtcIsoTimestamp;
  readonly relatedObjectIds?: readonly FormalId[];
}>;

export type GitChangeBoundaryErrorCode =
  "invalid_path" | "not_repository" | "git_failed" | "audit_failed";

export type GitChangeBoundaryError = Readonly<{
  readonly code: GitChangeBoundaryErrorCode;
  readonly message: string;
  readonly details: readonly string[];
}>;

export type GitChangeBoundaryResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: GitChangeBoundaryError }>;

export const defaultForbiddenGitActions = [
  "force_push",
  "history_rewrite",
  "remote_operation",
  "write_main",
] as const;

function failure<Value>(
  code: GitChangeBoundaryErrorCode,
  message: string,
  details: readonly string[] = [],
): GitChangeBoundaryResult<Value> {
  return { ok: false, error: { code, message, details } };
}

function successful(command: GitCommandResult): boolean {
  return command.exitCode === 0 && command.error === null;
}

function commandDetails(command: GitCommandResult): readonly string[] {
  return [
    ...[command.stdout, command.stderr].filter(
      (value) => value.trim().length > 0,
    ),
    ...(command.error === null ? [] : [command.error]),
  ];
}

function normalizeRelativePath(value: string): string | null {
  if (value.length === 0 || isAbsolute(value)) return null;
  const normalized = value.replaceAll("\\", "/");
  const parts = normalized.split("/").filter((part) => part.length > 0);
  if (parts.some((part) => part === "..")) return null;
  const result = parts.filter((part) => part !== ".").join("/");
  if (result.length === 0) return ".";
  return process.platform === "win32" ? result.toLowerCase() : result;
}

function pathMatches(rule: string, candidate: string): boolean {
  const normalizedRule = normalizeRelativePath(rule);
  const normalizedCandidate = normalizeRelativePath(candidate);
  if (normalizedRule === null || normalizedCandidate === null) return false;
  return (
    normalizedRule === "." ||
    normalizedRule === normalizedCandidate ||
    normalizedCandidate.startsWith(`${normalizedRule}/`)
  );
}

function changedPaths(entry: GitChangeEntry): readonly string[] {
  return entry.previousPath === null
    ? [entry.path]
    : [entry.previousPath, entry.path];
}

function entryKey(entry: GitChangeEntry): string {
  return [
    entry.kind,
    entry.path,
    entry.previousPath ?? "",
    entry.indexStatus,
    entry.worktreeStatus,
    entry.contentHash ?? "",
  ].join("\u0000");
}

function parseStatusOutput(output: string): readonly {
  readonly indexStatus: string;
  readonly worktreeStatus: string;
  readonly path: string;
  readonly previousPath: string | null;
}[] {
  const records: {
    indexStatus: string;
    worktreeStatus: string;
    path: string;
    previousPath: string | null;
  }[] = [];
  const fields = output.split("\u0000");
  for (let index = 0; index < fields.length; index += 1) {
    const record = fields[index];
    if (record === undefined || record.length < 4) continue;
    const indexStatus = record[0] ?? " ";
    const worktreeStatus = record[1] ?? " ";
    const path = record.slice(3);
    if (indexStatus === "R" || indexStatus === "C") {
      const previousPath = fields[index + 1];
      index += 1;
      records.push({
        indexStatus,
        worktreeStatus,
        path,
        previousPath: previousPath ?? null,
      });
    } else {
      records.push({
        indexStatus,
        worktreeStatus,
        path,
        previousPath: null,
      });
    }
  }
  return records;
}

async function fileHash(
  projectRoot: string,
  relativePath: string,
): Promise<string | null> {
  const absolutePath = resolve(projectRoot, relativePath);
  try {
    const stat = await lstat(absolutePath);
    if (!stat.isFile()) return null;
    return sha256Content(await readFile(absolutePath));
  } catch {
    return null;
  }
}

function changeKind(
  indexStatus: string,
  worktreeStatus: string,
  path: string,
): GitChangeKind {
  if (indexStatus === "?" && worktreeStatus === "?") return "untracked";
  if (indexStatus === "R" || worktreeStatus === "R") return "renamed";
  if (indexStatus === "C" || worktreeStatus === "C") return "copied";
  if (indexStatus === "D" || worktreeStatus === "D") return "deleted";
  if (indexStatus === "A" || worktreeStatus === "A") return "added";
  if (path.length > 0) return "modified";
  return "modified";
}

function validatePolicyPaths(policy: GitBoundaryPolicy): readonly string[] {
  return [...policy.allowedPaths, ...policy.forbiddenPaths].filter(
    (path) => normalizeRelativePath(path) === null,
  );
}

export function evaluateGitBoundary(
  request: GitBoundaryRequest,
): GitBoundaryReport {
  const violations: GitBoundaryViolation[] = [];
  for (const path of validatePolicyPaths(request.policy)) {
    violations.push({
      code: "invalid_path",
      path,
      message: `Boundary rule contains an invalid relative path: ${path}.`,
    });
  }

  const beforeKeys = new Set(request.before.entries.map(entryKey));
  const changes = request.after.entries.filter(
    (entry) => !beforeKeys.has(entryKey(entry)),
  );

  if (request.before.head !== request.after.head) {
    violations.push({
      code: "head_changed",
      message: "The repository HEAD changed during task execution.",
    });
  }
  if (request.before.branch !== request.after.branch) {
    violations.push({
      code: "branch_changed",
      message: "The repository branch changed during task execution.",
    });
  }

  for (const action of request.actions ?? []) {
    const forbiddenActions = [
      ...defaultForbiddenGitActions,
      ...(request.policy.forbiddenActions ?? []),
    ];
    if (forbiddenActions.includes(action)) {
      violations.push({
        code: "forbidden_action",
        action,
        message: `The Git action is forbidden: ${action}.`,
      });
    }
  }

  for (const entry of changes) {
    for (const path of changedPaths(entry)) {
      if (normalizeRelativePath(path) === null) {
        violations.push({
          code: "invalid_path",
          path,
          message: `Git reported an invalid relative path: ${path}.`,
        });
        continue;
      }
      if (
        request.policy.forbiddenPaths.some((rule) => pathMatches(rule, path))
      ) {
        violations.push({
          code: "forbidden_path",
          path,
          message: `The changed path is forbidden: ${path}.`,
        });
      } else if (
        !request.policy.allowedPaths.some((rule) => pathMatches(rule, path))
      ) {
        violations.push({
          code: "path_not_allowed",
          path,
          message: `The changed path is outside the allowed paths: ${path}.`,
        });
      }
    }
  }

  return {
    passed: violations.length === 0,
    changes,
    violations,
    beforeHead: request.before.head,
    afterHead: request.after.head,
    beforeBranch: request.before.branch,
    afterBranch: request.after.branch,
  };
}

export class GitChangeBoundaryService {
  private readonly git: GitProcess;
  private readonly bootstrap: GitBootstrapService;
  private readonly auditLogFactory: (projectRoot: string) => Readonly<{
    readonly append: (
      event: AuditEvent,
    ) => Promise<AuditLogRepositoryResult<AuditEvent>>;
  }>;

  public constructor(
    git: GitProcess = new GitProcess(),
    bootstrap = new GitBootstrapService(git),
    auditLogFactory: (projectRoot: string) => Readonly<{
      readonly append: (
        event: AuditEvent,
      ) => Promise<AuditLogRepositoryResult<AuditEvent>>;
    }> = (projectRoot) => new AuditLogRepository(projectRoot),
  ) {
    this.git = git;
    this.bootstrap = bootstrap;
    this.auditLogFactory = auditLogFactory;
  }

  public async capture(
    projectRoot: string,
  ): Promise<GitChangeBoundaryResult<GitChangeSnapshot>> {
    const rootPath = resolve(projectRoot);
    const detection = await this.bootstrap.detect(rootPath);
    if (!detection.ok) {
      return failure(
        "not_repository",
        detection.error.message,
        detection.error.details,
      );
    }
    if (detection.value.state !== "existing_repository") {
      return failure(
        "not_repository",
        "A valid Git repository is required to capture changes.",
        detection.value.details,
      );
    }

    const status = await this.git.run(
      ["status", "--porcelain=v1", "--untracked-files=all", "-z"],
      rootPath,
    );
    if (!successful(status)) {
      return failure(
        "git_failed",
        "Git status could not be captured.",
        commandDetails(status),
      );
    }
    const parsed = parseStatusOutput(status.stdout);
    const entries: GitChangeEntry[] = [];
    for (const item of parsed) {
      entries.push({
        ...item,
        kind: changeKind(item.indexStatus, item.worktreeStatus, item.path),
        contentHash: await fileHash(rootPath, item.path),
      });
    }
    return {
      ok: true,
      value: {
        projectRoot: rootPath,
        head: detection.value.head ?? "",
        branch: detection.value.branch,
        entries: entries.toSorted((left, right) =>
          left.path.localeCompare(right.path),
        ),
      },
    };
  }

  public async validate(
    before: GitChangeSnapshot,
    policy: GitBoundaryPolicy,
    actions: readonly string[] = [],
    auditContext?: GitBoundaryAuditContext,
  ): Promise<GitChangeBoundaryResult<GitBoundaryReport>> {
    const after = await this.capture(before.projectRoot);
    if (!after.ok) return after;
    const report = evaluateGitBoundary({
      before,
      after: after.value,
      policy,
      actions,
    });
    if (report.violations.length > 0 && auditContext !== undefined) {
      const audited = await this.recordViolation(
        before.projectRoot,
        report,
        auditContext,
      );
      if (!audited.ok) return audited;
    }
    return {
      ok: true,
      value: report,
    };
  }

  private async recordViolation(
    projectRoot: string,
    report: GitBoundaryReport,
    context: GitBoundaryAuditContext,
  ): Promise<GitChangeBoundaryResult<null>> {
    const event = createAuditEvent({
      id: context.executionId,
      occurredAt: context.occurredAt,
      type: "privilege_violation",
      actor: "system",
      action: "git boundary validation failed",
      relatedObjectIds: context.relatedObjectIds ?? [],
      executionId: context.executionId,
      details: {
        project_root: projectRoot,
        changed_count: report.changes.length,
        violation_codes: report.violations
          .map((violation) => violation.code)
          .join(","),
        violation_paths: report.violations
          .map((violation) => violation.path ?? "")
          .filter((path) => path.length > 0)
          .join(","),
      },
    });
    if (!event.ok) {
      return failure("audit_failed", event.error.message, event.error.details);
    }
    const appended = await this.auditLogFactory(projectRoot).append(
      event.value,
    );
    if (!appended.ok) {
      return failure(
        "audit_failed",
        appended.error.message,
        appended.error.details,
      );
    }
    return { ok: true, value: null };
  }

  public async collectAndValidate(
    projectRoot: string,
    policy: GitBoundaryPolicy,
    actions: readonly string[] = [],
  ): Promise<
    GitChangeBoundaryResult<
      Readonly<{
        readonly before: GitChangeSnapshot;
        readonly report: GitBoundaryReport;
      }>
    >
  > {
    const before = await this.capture(projectRoot);
    if (!before.ok) return before;
    const report = await this.validate(before.value, policy, actions);
    if (!report.ok) return report;
    return { ok: true, value: { before: before.value, report: report.value } };
  }
}

export { GitChangeBoundaryService as GitDiffAdapter };
