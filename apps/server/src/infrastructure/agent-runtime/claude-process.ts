import { spawn } from "node:child_process";
import type { Readable } from "node:stream";

import type { ClaudeCommand } from "./claude-cli-args.js";

export type ClaudeProcessExit = Readonly<{
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly error: string | null;
}>;

export type ClaudeProcess = Readonly<{
  readonly pid: number | undefined;
  readonly stdout: Readable;
  readonly stderr: Readable;
  readonly exit: Promise<ClaudeProcessExit>;
  readonly kill: (signal?: NodeJS.Signals | number) => boolean;
}>;

export type ClaudeProcessFactory = (
  command: ClaudeCommand,
) => ClaudeProcess | Promise<ClaudeProcess>;

export function spawnClaudeProcess(command: ClaudeCommand): ClaudeProcess {
  const child = spawn(command.executable, [...command.args], {
    cwd: command.workingDirectory,
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const exit = new Promise<ClaudeProcessExit>((resolve) => {
    let settled = false;
    const finish = (value: ClaudeProcessExit): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    child.once("error", (error: Error) =>
      finish({ code: null, signal: null, error: error.message }),
    );
    child.once("close", (code, signal) =>
      finish({ code, signal, error: null }),
    );
  });

  if (child.stdout === null || child.stderr === null) {
    throw new Error("Claude process did not expose stdout and stderr streams.");
  }
  return {
    pid: child.pid,
    stdout: child.stdout,
    stderr: child.stderr,
    exit,
    kill: (signal = "SIGTERM") => child.kill(signal),
  };
}
