import { spawn } from "node:child_process";
import type { Readable } from "node:stream";

import type { CodexExecCommand } from "./codex-exec-args.js";

export type CodexProcessExit = Readonly<{
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly error: string | null;
}>;

export type CodexProcess = Readonly<{
  readonly pid: number | undefined;
  readonly stdout: Readable;
  readonly stderr: Readable;
  readonly exit: Promise<CodexProcessExit>;
  readonly kill: (signal?: NodeJS.Signals | number) => boolean;
}>;

export type CodexProcessFactory = (
  command: CodexExecCommand,
) => CodexProcess | Promise<CodexProcess>;

export function spawnCodexProcess(command: CodexExecCommand): CodexProcess {
  const child = spawn(command.executable, [...command.args], {
    cwd: command.workingDirectory,
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const exit = new Promise<CodexProcessExit>((resolve) => {
    let settled = false;
    const finish = (value: CodexProcessExit): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    child.once("error", (error: Error) => {
      finish({ code: null, signal: null, error: error.message });
    });
    child.once(
      "close",
      (code: number | null, signal: NodeJS.Signals | null) => {
        finish({ code, signal, error: null });
      },
    );
  });

  if (child.stdout === null || child.stderr === null) {
    throw new Error("Codex process did not expose stdout and stderr streams.");
  }
  return {
    pid: child.pid,
    stdout: child.stdout,
    stderr: child.stderr,
    exit,
    kill: (signal = "SIGTERM") => child.kill(signal),
  };
}
