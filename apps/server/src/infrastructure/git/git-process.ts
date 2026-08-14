import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type GitCommandResult = Readonly<{
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: string | null;
}>;

export class GitProcess {
  public async run(
    args: readonly string[],
    cwd: string,
  ): Promise<GitCommandResult> {
    try {
      const result = await execFileAsync("git", [...args], {
        cwd,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 4,
      });
      return {
        exitCode: 0,
        stdout: result.stdout,
        stderr: result.stderr,
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
}
