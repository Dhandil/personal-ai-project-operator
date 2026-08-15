import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";

import type {
  AgentResult,
  ExecutionId,
  TaskId,
} from "@personal-ai-operator/contracts";

import type { TaskSnapshot } from "../tasks/task-service.js";
import {
  GitChangeBoundaryService,
  type GitBoundaryAuditContext,
  type GitBoundaryReport,
  type GitChangeBoundaryResult,
  type GitChangeSnapshot,
} from "../git/git-change-boundary.js";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const SHELL_OPERATOR_PATTERN = /[;&|<>`]/;

export type VerificationCommandResult = Readonly<{
  readonly command: string;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: string | null;
}>;

export type VerificationCommandRunner = (
  command: string,
  projectRoot: string,
) => Promise<VerificationCommandResult>;

export type ArtifactCheck = Readonly<{
  readonly path: string;
  readonly exists: boolean;
  readonly kind: "file" | "directory" | "missing" | "invalid_path";
}>;

export type EvidenceCheck = Readonly<{
  readonly required: readonly string[];
  readonly verified: boolean;
  readonly details: readonly string[];
}>;

export type TaskResultValidationReport = Readonly<{
  readonly passed: boolean;
  readonly executionId: ExecutionId;
  readonly taskId: TaskId;
  readonly claimedStatus: AgentResult["status"];
  readonly artifacts: readonly ArtifactCheck[];
  readonly verification: readonly VerificationCommandResult[];
  readonly boundary: GitBoundaryReport;
  readonly evidence: EvidenceCheck;
  readonly reasons: readonly string[];
}>;

export type TaskResultValidationRequest = Readonly<{
  readonly projectRoot: string;
  readonly task: TaskSnapshot;
  readonly baseline: GitChangeSnapshot;
  readonly executionId: ExecutionId;
  readonly result: AgentResult;
  readonly actions?: readonly string[];
  readonly auditContext?: GitBoundaryAuditContext;
}>;

export type TaskResultValidationErrorCode =
  "invalid_request" | "boundary_failed";

export type TaskResultValidationError = Readonly<{
  readonly code: TaskResultValidationErrorCode;
  readonly message: string;
  readonly details: readonly string[];
}>;

export type TaskResultValidationResult =
  | Readonly<{
      readonly ok: true;
      readonly value: TaskResultValidationReport;
    }>
  | Readonly<{
      readonly ok: false;
      readonly error: TaskResultValidationError;
    }>;

export type TaskResultValidationOptions = Readonly<{
  readonly boundary?: GitChangeBoundaryService;
  readonly commandRunner?: VerificationCommandRunner;
}>;

function failure(
  code: TaskResultValidationErrorCode,
  message: string,
  details: readonly string[] = [],
): TaskResultValidationResult {
  return { ok: false, error: { code, message, details } };
}

function parseCommand(command: string): Readonly<{
  readonly executable: string;
  readonly args: readonly string[];
}> | null {
  if (command.trim().length === 0 || SHELL_OPERATOR_PATTERN.test(command)) {
    return null;
  }

  const tokens: string[] = [];
  let token = "";
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (character === undefined) continue;
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      } else {
        token += character;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
    } else if (/\s/.test(character)) {
      if (token.length > 0) {
        tokens.push(token);
        token = "";
      }
    } else {
      token += character;
    }
  }
  if (quote !== null) return null;
  if (token.length > 0) tokens.push(token);
  const executable = tokens[0];
  if (executable === undefined) return null;
  return { executable, args: tokens.slice(1) };
}

async function runVerificationCommand(
  command: string,
  projectRoot: string,
): Promise<VerificationCommandResult> {
  const parsed = parseCommand(command);
  if (parsed === null) {
    return {
      command,
      exitCode: 1,
      stdout: "",
      stderr: "",
      error: "Verification command contains an unsupported shell expression.",
    };
  }

  const executable =
    process.platform === "win32" && parsed.executable === "npm"
      ? "npm.cmd"
      : parsed.executable;
  try {
    const result = await execFileAsync(executable, [...parsed.args], {
      cwd: projectRoot,
      maxBuffer: MAX_OUTPUT_BYTES,
      shell: false,
      windowsHide: true,
    });
    return {
      command,
      exitCode: 0,
      stdout: String(result.stdout),
      stderr: String(result.stderr),
      error: null,
    };
  } catch (error) {
    const candidate = error as {
      readonly code?: number | string;
      readonly stdout?: string;
      readonly stderr?: string;
      readonly message?: string;
    };
    return {
      command,
      exitCode: typeof candidate.code === "number" ? candidate.code : 1,
      stdout: candidate.stdout ?? "",
      stderr: candidate.stderr ?? "",
      error: candidate.message ?? String(error),
    };
  }
}

function isValidRelativePath(value: string): boolean {
  if (value.trim().length === 0 || isAbsolute(value)) return false;
  const parts = value.replaceAll("\\", "/").split("/");
  return !parts.some((part) => part === "..");
}

async function checkArtifact(
  projectRoot: string,
  path: string,
): Promise<ArtifactCheck> {
  if (!isValidRelativePath(path)) {
    return { path, exists: false, kind: "invalid_path" };
  }
  try {
    const stat = await lstat(resolve(projectRoot, path));
    return {
      path,
      exists: true,
      kind: stat.isDirectory() ? "directory" : "file",
    };
  } catch {
    return { path, exists: false, kind: "missing" };
  }
}

function boundaryDetails(
  result: GitChangeBoundaryResult<GitBoundaryReport>,
): readonly string[] {
  return result.ok ? [] : [result.error.message, ...result.error.details];
}

export class TaskResultValidationService {
  private readonly boundary: GitChangeBoundaryService;
  private readonly commandRunner: VerificationCommandRunner;

  public constructor(options: TaskResultValidationOptions = {}) {
    this.boundary = options.boundary ?? new GitChangeBoundaryService();
    this.commandRunner = options.commandRunner ?? runVerificationCommand;
  }

  public async validate(
    request: TaskResultValidationRequest,
  ): Promise<TaskResultValidationResult> {
    if (request.executionId !== request.result.executionId) {
      return failure(
        "invalid_request",
        "The validation execution ID does not match the Agent result.",
      );
    }

    const boundary = await this.boundary.validate(
      request.baseline,
      {
        allowedPaths: request.task.task.allowedPaths,
        forbiddenPaths: request.task.task.forbiddenPaths,
      },
      request.actions ?? [],
      request.auditContext,
    );
    if (!boundary.ok) {
      return failure(
        "boundary_failed",
        "The Git boundary could not be validated.",
        boundaryDetails(boundary),
      );
    }

    const artifacts = await Promise.all(
      request.task.task.requiredFiles.map((path) =>
        checkArtifact(request.projectRoot, path),
      ),
    );
    const verification: VerificationCommandResult[] = [];
    for (const command of request.task.task.run.verificationCommands) {
      verification.push(await this.commandRunner(command, request.projectRoot));
    }
    const evidenceDetails: string[] = [];
    if (request.task.task.evidence.length === 0) {
      evidenceDetails.push("The task card has no required evidence.");
    }
    if (request.result.output?.verified !== true) {
      evidenceDetails.push(
        "The Agent result does not contain the required verified=true marker.",
      );
    }
    if (request.result.error !== null) {
      evidenceDetails.push(
        `The Agent result contains an error: ${request.result.error.code}.`,
      );
    }
    const evidence: EvidenceCheck = {
      required: request.task.task.evidence,
      verified: evidenceDetails.length === 0,
      details: evidenceDetails,
    };

    const reasons: string[] = [];
    if (request.result.status !== "completed") {
      reasons.push(
        `The Agent claimed result status ${request.result.status}, not completed.`,
      );
    }
    if (request.task.task.requiredFiles.length === 0) {
      reasons.push("The task card has no required artifact paths.");
    }
    for (const artifact of artifacts) {
      if (!artifact.exists) {
        reasons.push(`Required artifact is unavailable: ${artifact.path}.`);
      }
    }
    for (const command of verification) {
      if (command.exitCode !== 0 || command.error !== null) {
        reasons.push(`Verification command failed: ${command.command}.`);
      }
    }
    if (!boundary.value.passed) {
      reasons.push(
        ...boundary.value.violations.map((violation) => violation.message),
      );
    }
    reasons.push(...evidence.details);

    return {
      ok: true,
      value: {
        passed:
          request.result.status === "completed" &&
          artifacts.length > 0 &&
          artifacts.every((artifact) => artifact.exists) &&
          verification.length > 0 &&
          verification.every(
            (command) => command.exitCode === 0 && command.error === null,
          ) &&
          boundary.value.passed &&
          evidence.verified,
        executionId: request.executionId,
        taskId: request.task.task.id,
        claimedStatus: request.result.status,
        artifacts,
        verification,
        boundary: boundary.value,
        evidence,
        reasons,
      },
    };
  }
}
