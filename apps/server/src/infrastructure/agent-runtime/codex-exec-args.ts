import type { AgentStartRequest } from "@personal-ai-operator/contracts";

import { AgentRuntimeValidationError } from "./agent-runtime-port.js";

export type CodexSandbox = "workspace-write" | "read-only";

export type CodexExecCommand = Readonly<{
  readonly executable: string;
  readonly args: readonly string[];
  readonly workingDirectory: string;
  readonly sandbox: CodexSandbox;
}>;

export type CodexExecArgsOptions = Readonly<{
  readonly outputSchemaPath?: string;
}>;

function sandboxForRole(role: string): CodexSandbox {
  if (role === "executor") return "workspace-write";
  if (role === "reviewer") return "read-only";
  throw new AgentRuntimeValidationError(
    "Codex exec supports only executor and reviewer roles.",
  );
}

export function buildCodexExecArgs(
  request: AgentStartRequest,
  options: CodexExecArgsOptions = {},
): CodexExecCommand {
  const sandbox = sandboxForRole(request.role);
  const args = [
    "exec",
    "--json",
    "--cd",
    request.workingDirectory,
    "--sandbox",
    sandbox,
  ];
  if (options.outputSchemaPath !== undefined) {
    args.push("--output-schema", options.outputSchemaPath);
  }
  args.push(request.prompt);
  return {
    executable: "codex",
    args,
    workingDirectory: request.workingDirectory,
    sandbox,
  };
}

export function buildCodexExecResumeArgs(
  request: AgentStartRequest,
  sessionId: string,
  options: CodexExecArgsOptions = {},
): CodexExecCommand {
  if (sessionId.trim().length === 0) {
    throw new AgentRuntimeValidationError(
      "A precise Codex session ID is required for resume.",
    );
  }
  const sandbox = sandboxForRole(request.role);
  const args = [
    "exec",
    "resume",
    sessionId,
    "--json",
    "--cd",
    request.workingDirectory,
    "--sandbox",
    sandbox,
  ];
  if (options.outputSchemaPath !== undefined) {
    args.push("--output-schema", options.outputSchemaPath);
  }
  args.push(request.prompt);
  return {
    executable: "codex",
    args,
    workingDirectory: request.workingDirectory,
    sandbox,
  };
}
