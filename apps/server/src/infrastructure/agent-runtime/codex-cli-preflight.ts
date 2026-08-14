import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type {
  CodexCliPreflightReport,
  CodexLoginStatus,
  CodexSandboxMode,
} from "@personal-ai-operator/contracts";

const execFileAsync = promisify(execFile);
const VERSION_PATTERN =
  /(?:codex(?:-cli)?\s+)?v?(\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?)/i;
const NOT_AUTHENTICATED_PATTERN =
  /not\s+logged|not\s+authenticated|login\s+required|logged\s+out/i;
const HIGH_INTEGRITY_LEVEL = 12_288;

export type CodexProbeCommand = Readonly<{
  readonly executable: string;
  readonly args: readonly string[];
}>;

export type CodexProbeProcessResult = Readonly<{
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: string | null;
}>;

export type CodexProbeRunner = (
  command: CodexProbeCommand,
) => Promise<CodexProbeProcessResult>;

export type CodexCliPreflightOptions = Readonly<{
  readonly executable?: string;
  readonly platform?: NodeJS.Platform;
  readonly now?: () => string;
  readonly runner?: CodexProbeRunner;
  readonly elevationProbe?: () => Promise<boolean | null>;
}>;

function timestamp(): string {
  return new Date().toISOString();
}

async function runProcess(
  command: CodexProbeCommand,
): Promise<CodexProbeProcessResult> {
  try {
    const result = await execFileAsync(command.executable, [...command.args], {
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 2,
    });
    return {
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
      exitCode: typeof candidate.code === "number" ? candidate.code : 1,
      stdout: candidate.stdout ?? "",
      stderr: candidate.stderr ?? "",
      error: candidate.message ?? String(error),
    };
  }
}

function outputOf(result: CodexProbeProcessResult): string {
  return `${result.stdout}\n${result.stderr}`.trim();
}

function commandSucceeded(result: CodexProbeProcessResult): boolean {
  return result.exitCode === 0;
}

function extractVersion(result: CodexProbeProcessResult): string | null {
  return outputOf(result).match(VERSION_PATTERN)?.[1] ?? null;
}

function hasAll(text: string, fragments: readonly string[]): boolean {
  const normalized = text.toLowerCase();
  return fragments.every((fragment) => normalized.includes(fragment));
}

function loginStatus(result: CodexProbeProcessResult): CodexLoginStatus {
  const output = outputOf(result);
  if (commandSucceeded(result) && !NOT_AUTHENTICATED_PATTERN.test(output)) {
    return "authenticated";
  }
  if (NOT_AUTHENTICATED_PATTERN.test(output) || result.error !== null) {
    return "unauthenticated";
  }
  return "unknown";
}

function parseElevationOutput(result: CodexProbeProcessResult): boolean | null {
  if (!commandSucceeded(result)) return null;
  const levels = [...result.stdout.matchAll(/S-1-16-(\d+)/gi)].map((match) =>
    Number(match[1]),
  );
  return levels.length === 0
    ? null
    : levels.some((level) => level >= HIGH_INTEGRITY_LEVEL);
}

async function detectWindowsElevation(
  runner: CodexProbeRunner,
): Promise<boolean | null> {
  return parseElevationOutput(
    await runner({ executable: "whoami", args: ["/groups"] }),
  );
}

function buildSandbox(
  platform: NodeJS.Platform,
  workspaceWrite: boolean,
  readOnly: boolean,
  elevated: boolean | null,
): {
  readonly sandbox: CodexCliPreflightReport["sandbox"];
  readonly blockers: readonly string[];
  readonly recommendations: readonly string[];
} {
  const blockers: string[] = [];
  const recommendations: string[] = [];
  const nativeWindows = platform === "win32";
  let mode: CodexSandboxMode = "unavailable";
  let warning: string | null = null;

  if (!nativeWindows) {
    blockers.push(
      "Windows native Codex sandbox capability is unavailable on this platform.",
    );
    recommendations.push(
      "Run the application on Windows 11 native mode before starting Codex execution.",
    );
  } else if (!workspaceWrite || !readOnly) {
    blockers.push(
      "Codex CLI does not advertise both workspace-write and read-only sandbox modes.",
    );
    recommendations.push(
      "Install a Codex CLI version that supports --sandbox workspace-write and --sandbox read-only.",
    );
  } else if (elevated === true) {
    mode = "elevated";
  } else {
    mode = "unelevated";
    warning =
      "Windows elevated sandbox was not available; execution will use an unelevated sandbox fallback.";
    recommendations.push(
      "Prefer restarting the application with Windows elevation before starting execution.",
    );
  }

  return {
    sandbox: {
      nativeWindows,
      workspaceWrite,
      readOnly,
      elevated,
      mode,
      warning,
    },
    blockers,
    recommendations,
  };
}

export class CodexCliPreflightService {
  private readonly executable: string;
  private readonly platform: NodeJS.Platform;
  private readonly now: () => string;
  private readonly runner: CodexProbeRunner;
  private readonly elevationProbe: () => Promise<boolean | null>;

  public constructor(options: CodexCliPreflightOptions = {}) {
    this.executable =
      options.executable ?? process.env.CODEX_CLI_PATH ?? "codex";
    this.platform = options.platform ?? process.platform;
    this.now = options.now ?? timestamp;
    this.runner = options.runner ?? runProcess;
    this.elevationProbe =
      options.elevationProbe ?? (() => detectWindowsElevation(this.runner));
  }

  public async check(): Promise<CodexCliPreflightReport> {
    const versionResult = await this.runner({
      executable: this.executable,
      args: ["--version"],
    });
    const installed = commandSucceeded(versionResult);
    const version = installed ? extractVersion(versionResult) : null;
    const baseCommands = {
      exec: false,
      execResume: false,
      delete: false,
      json: false,
      outputSchema: false,
      sandboxFlag: false,
    } as const;

    if (!installed) {
      return {
        schemaVersion: 1,
        checkedAt: this.now(),
        platform: this.platform,
        executable: this.executable,
        installed: false,
        version: null,
        launchError: versionResult.error,
        login: { status: "unknown" },
        commands: baseCommands,
        sandbox: {
          nativeWindows: this.platform === "win32",
          workspaceWrite: false,
          readOnly: false,
          elevated: null,
          mode: "unavailable",
          warning: null,
        },
        canExecute: false,
        blockers: [
          versionResult.error?.includes("EPERM") === true
            ? "The server process found a Codex CLI command but could not start it because Windows denied process creation."
            : "Codex CLI is not installed or the codex executable is not available on PATH.",
        ],
        recommendations: [
          versionResult.error?.includes("EPERM") === true
            ? "Run the server with the required Windows process permission, or configure CODEX_CLI_PATH to an executable the server can start."
            : "Install Codex CLI and ensure the codex executable is on PATH, or configure CODEX_CLI_PATH.",
        ],
      };
    }

    const execHelp = await this.runner({
      executable: this.executable,
      args: ["exec", "--help"],
    });
    const execResumeHelp = await this.runner({
      executable: this.executable,
      args: ["exec", "resume", "--help"],
    });
    const deleteHelp = await this.runner({
      executable: this.executable,
      args: ["delete", "--help"],
    });
    const execHelpText = outputOf(execHelp);
    const commands = {
      exec: commandSucceeded(execHelp),
      execResume: commandSucceeded(execResumeHelp),
      delete: commandSucceeded(deleteHelp),
      json: execHelpText.includes("--json"),
      outputSchema: execHelpText.includes("--output-schema"),
      sandboxFlag: execHelpText.includes("--sandbox"),
    };
    const login = {
      status: loginStatus(
        await this.runner({
          executable: this.executable,
          args: ["login", "status"],
        }),
      ),
    };
    const elevated =
      this.platform === "win32" ? await this.elevationProbe() : null;
    const workspaceWrite = hasAll(execHelpText, ["workspace-write"]);
    const readOnly = hasAll(execHelpText, ["read-only"]);
    const sandboxResult = buildSandbox(
      this.platform,
      workspaceWrite && commands.sandboxFlag,
      readOnly && commands.sandboxFlag,
      elevated,
    );
    const blockers = [...sandboxResult.blockers];
    const recommendations = [...sandboxResult.recommendations];

    if (version === null) {
      blockers.push("Codex CLI version could not be determined.");
      recommendations.push(
        "Install a Codex CLI release that reports a semantic version from codex --version.",
      );
    }
    if (login.status !== "authenticated") {
      blockers.push(
        login.status === "unauthenticated"
          ? "Codex CLI is not logged in."
          : "Codex CLI login status could not be confirmed.",
      );
      recommendations.push("Run codex login before starting execution.");
    }
    if (!commands.exec || !commands.execResume || !commands.delete) {
      blockers.push(
        "Required Codex CLI commands are unavailable: codex exec, codex exec resume, and codex delete.",
      );
      recommendations.push(
        "Install a Codex CLI version exposing exec, exec resume, and delete commands.",
      );
    }
    if (!commands.json || !commands.outputSchema) {
      blockers.push(
        "Codex CLI exec does not expose both JSONL and output-schema options.",
      );
      recommendations.push(
        "Install a Codex CLI version supporting --json and --output-schema.",
      );
    }

    return {
      schemaVersion: 1,
      checkedAt: this.now(),
      platform: this.platform,
      executable: this.executable,
      installed: true,
      version,
      launchError: null,
      login,
      commands,
      sandbox: sandboxResult.sandbox,
      canExecute: blockers.length === 0,
      blockers,
      recommendations: [...new Set(recommendations)],
    };
  }
}
