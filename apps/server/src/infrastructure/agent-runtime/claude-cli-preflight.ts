import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

export type ClaudeProvider = "deepseek" | "anthropic" | "unknown";

export type ClaudeCliPreflightReport = Readonly<{
  readonly checkedAt: string;
  readonly executable: string;
  readonly installed: boolean;
  readonly version: string | null;
  readonly launchError: string | null;
  readonly loggedIn: boolean | null;
  readonly provider: ClaudeProvider;
  readonly commands: Readonly<{
    readonly print: boolean;
    readonly json: boolean;
    readonly streamJson: boolean;
    readonly resume: boolean;
    readonly noSessionPersistence: boolean;
    readonly permissionMode: boolean;
    readonly toolBoundary: boolean;
    readonly jsonSchema: boolean;
    readonly projectPurge: boolean;
  }>;
  readonly canExecute: boolean;
  readonly blockers: readonly string[];
  readonly recommendations: readonly string[];
}>;

export type ClaudeProbeCommand = Readonly<{
  readonly executable: string;
  readonly args: readonly string[];
}>;

export type ClaudeProbeResult = Readonly<{
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: string | null;
}>;

export type ClaudeProbeRunner = (
  command: ClaudeProbeCommand,
) => Promise<ClaudeProbeResult>;

export type ClaudeCliPreflightOptions = Readonly<{
  readonly executable?: string;
  readonly now?: () => string;
  readonly runner?: ClaudeProbeRunner;
}>;

const execFileAsync = promisify(execFile);

function defaultExecutable(): string {
  if (process.platform === "win32") {
    const candidate = join(
      process.env.APPDATA ?? "",
      "npm",
      "node_modules",
      "@anthropic-ai",
      "claude-code",
      "bin",
      "claude.exe",
    );
    if (existsSync(candidate)) return candidate;
  }
  return "claude";
}

function now(): string {
  return new Date().toISOString();
}

async function runProcess(
  command: ClaudeProbeCommand,
): Promise<ClaudeProbeResult> {
  try {
    const result = await execFileAsync(command.executable, [...command.args], {
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
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

function output(result: ClaudeProbeResult): string {
  return `${result.stdout}\n${result.stderr}`.trim();
}

function providerOf(value: unknown): ClaudeProvider {
  const text = typeof value === "string" ? value.toLowerCase() : "";
  if (text.includes("deepseek")) return "deepseek";
  if (text.includes("anthropic") || text.includes("claude")) return "anthropic";
  return "unknown";
}

function versionOf(text: string): string | null {
  return (
    text.match(
      /(?:claude(?:-code)?\s+)?v?(\d+\.\d+(?:\.\d+)?(?:[-+][\w.-]+)?)/i,
    )?.[1] ?? null
  );
}

function authOf(result: ClaudeProbeResult): Readonly<{
  readonly loggedIn: boolean | null;
  readonly provider: ClaudeProvider;
}> {
  try {
    const value = JSON.parse(result.stdout) as Record<string, unknown>;
    return {
      loggedIn: typeof value.loggedIn === "boolean" ? value.loggedIn : null,
      provider: providerOf(value.apiProvider),
    };
  } catch {
    return {
      loggedIn: result.exitCode === 0 ? null : false,
      provider: "unknown",
    };
  }
}

export class ClaudeCliPreflightService {
  private readonly executable: string;
  private readonly now: () => string;
  private readonly runner: ClaudeProbeRunner;

  public constructor(options: ClaudeCliPreflightOptions = {}) {
    this.executable =
      options.executable ?? process.env.CLAUDE_CLI_PATH ?? defaultExecutable();
    this.now = options.now ?? now;
    this.runner = options.runner ?? runProcess;
  }

  public async check(): Promise<ClaudeCliPreflightReport> {
    const versionResult = await this.runner({
      executable: this.executable,
      args: ["--version"],
    });
    const installed = versionResult.exitCode === 0;
    const baseCommands = {
      print: false,
      json: false,
      streamJson: false,
      resume: false,
      noSessionPersistence: false,
      permissionMode: false,
      toolBoundary: false,
      jsonSchema: false,
      projectPurge: false,
    } as const;
    if (!installed) {
      return {
        checkedAt: this.now(),
        executable: this.executable,
        installed: false,
        version: null,
        launchError: versionResult.error,
        loggedIn: null,
        provider: "unknown",
        commands: baseCommands,
        canExecute: false,
        blockers: [
          versionResult.error?.includes("EPERM") === true
            ? "Claude Code was found but Windows denied process creation."
            : "Claude Code is not installed or cannot be started.",
        ],
        recommendations: [
          versionResult.error?.includes("EPERM") === true
            ? "Run the service with permission to start Claude Code or configure CLAUDE_CLI_PATH."
            : "Install Claude Code or configure CLAUDE_CLI_PATH.",
        ],
      };
    }
    const help = output(
      await this.runner({ executable: this.executable, args: ["--help"] }),
    );
    const printHelp = output(
      await this.runner({
        executable: this.executable,
        args: ["-p", "--help"],
      }),
    );
    const purgeHelp = output(
      await this.runner({
        executable: this.executable,
        args: ["project", "purge", "--help"],
      }),
    );
    const auth = authOf(
      await this.runner({
        executable: this.executable,
        args: ["auth", "status", "--json"],
      }),
    );
    const commands = {
      print: help.includes("-p") || printHelp.includes("-p"),
      json: printHelp.includes("--output-format") && printHelp.includes("json"),
      streamJson:
        printHelp.includes("--output-format") &&
        printHelp.includes("stream-json"),
      resume: printHelp.includes("--resume") || help.includes("--resume"),
      noSessionPersistence: printHelp.includes("--no-session-persistence"),
      permissionMode: printHelp.includes("--permission-mode"),
      toolBoundary:
        printHelp.includes("--allowed-tools") &&
        printHelp.includes("--disallowed-tools"),
      jsonSchema: printHelp.includes("--json-schema"),
      projectPurge: purgeHelp.includes("purge"),
    };
    const blockers: string[] = [];
    const recommendations: string[] = [];
    if (auth.loggedIn !== true) {
      blockers.push(
        auth.loggedIn === false
          ? "Claude Code is not authenticated."
          : "Claude Code authentication status could not be confirmed.",
      );
      recommendations.push(
        "Authenticate Claude Code before starting execution.",
      );
    }
    const required = Object.entries(commands).filter(([, value]) => !value);
    if (required.length > 0) {
      blockers.push(
        `Claude Code capabilities are unavailable: ${required.map(([key]) => key).join(", ")}.`,
      );
      recommendations.push(
        "Install a Claude Code version supporting non-interactive JSON, resume, permission boundaries, and project cleanup.",
      );
    }
    return {
      checkedAt: this.now(),
      executable: this.executable,
      installed: true,
      version: versionOf(output(versionResult)),
      launchError: null,
      loggedIn: auth.loggedIn,
      provider: auth.provider,
      commands,
      canExecute: blockers.length === 0,
      blockers,
      recommendations: [...new Set(recommendations)],
    };
  }
}
