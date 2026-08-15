import type { AgentStartRequest } from "@personal-ai-operator/contracts";

import { AgentRuntimeValidationError } from "./agent-runtime-port.js";

export type ClaudeOutputFormat = "json" | "stream-json";
export type ClaudePermissionMode = "acceptEdits" | "plan";
export const DEFAULT_CLAUDE_MODEL = "deepseek-v4-pro";

export type ClaudeCommand = Readonly<{
  readonly executable: string;
  readonly args: readonly string[];
  readonly workingDirectory: string;
  readonly permissionMode: ClaudePermissionMode;
  readonly outputFormat?: ClaudeOutputFormat;
}>;

export type ClaudeCliArgsOptions = Readonly<{
  readonly outputFormat?: ClaudeOutputFormat;
  readonly jsonSchema?: Readonly<Record<string, unknown>>;
  readonly model?: string;
}>;

function modeForRole(role: string): ClaudePermissionMode {
  if (role === "executor") return "acceptEdits";
  if (role === "reviewer") return "plan";
  throw new AgentRuntimeValidationError(
    "Claude Code supports only executor and reviewer roles.",
  );
}

function commonArgs(
  request: AgentStartRequest,
  options: ClaudeCliArgsOptions,
): { readonly args: string[]; readonly permissionMode: ClaudePermissionMode } {
  const permissionMode = modeForRole(request.role);
  const outputFormat = options.outputFormat ?? "stream-json";
  const args = [
    "--output-format",
    outputFormat,
    "--verbose",
    "--permission-mode",
    permissionMode,
  ];
  const model = options.model ?? DEFAULT_CLAUDE_MODEL;
  if (model.trim().length === 0) {
    throw new AgentRuntimeValidationError(
      "Claude Code requires an explicit model configuration.",
    );
  }
  args.push("--model", model);
  if (request.role === "executor") {
    args.push(
      "--tools",
      "Read,Edit,Write,Bash",
      "--allowed-tools",
      "Read,Edit,Write,Bash",
    );
  } else {
    // On Windows, denying Bash alone is not a sufficient policy statement:
    // a shell-capable tool could otherwise reach PowerShell. Reviewer mode
    // therefore exposes only Read and also keeps explicit deny rules.
    args.push(
      "--tools",
      "Read",
      "--disallowed-tools",
      "Edit,Write,NotebookEdit,Bash,PowerShell",
    );
  }
  if (options.jsonSchema !== undefined) {
    args.push("--json-schema", JSON.stringify(options.jsonSchema));
  }
  return { args, permissionMode };
}

export function buildClaudeStartArgs(
  request: AgentStartRequest,
  options: ClaudeCliArgsOptions = {},
): ClaudeCommand {
  const common = commonArgs(request, options);
  const prompt = request.prompt;
  if (request.sessionPolicy === "ephemeral") {
    common.args.push("--no-session-persistence");
  }
  common.args.unshift(prompt);
  common.args.unshift("-p");
  return {
    executable: "claude",
    args: common.args,
    workingDirectory: request.workingDirectory,
    permissionMode: common.permissionMode,
    outputFormat: options.outputFormat ?? "stream-json",
  };
}

export function buildClaudeResumeArgs(
  request: AgentStartRequest,
  sessionId: string,
  options: ClaudeCliArgsOptions = {},
): ClaudeCommand {
  if (sessionId.trim().length === 0) {
    throw new AgentRuntimeValidationError(
      "A precise Claude session ID is required for resume.",
    );
  }
  const common = commonArgs(request, options);
  common.args.unshift(request.prompt);
  common.args.unshift("-p");
  common.args.push("--resume", sessionId);
  return {
    executable: "claude",
    args: common.args,
    workingDirectory: request.workingDirectory,
    permissionMode: common.permissionMode,
    outputFormat: options.outputFormat ?? "stream-json",
  };
}

export function buildClaudeProjectPurgeArgs(
  workingDirectory: string,
): ClaudeCommand {
  if (workingDirectory.trim().length === 0) {
    throw new AgentRuntimeValidationError(
      "A working directory is required for Claude project cleanup.",
    );
  }
  return {
    executable: "claude",
    args: ["project", "purge", workingDirectory, "--yes"],
    workingDirectory,
    permissionMode: "plan",
  };
}
