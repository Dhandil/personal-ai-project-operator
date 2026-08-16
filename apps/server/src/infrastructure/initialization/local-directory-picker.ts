import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import { isAbsolute, normalize, resolve, win32 } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type LocalDirectoryPickerErrorCode =
  "unsupported_platform" | "cancelled" | "picker_failed" | "invalid_selection";

export type LocalDirectoryPickerResult =
  | Readonly<{
      readonly ok: true;
      readonly value: Readonly<{ readonly projectRoot: string }>;
    }>
  | Readonly<{
      readonly ok: false;
      readonly error: Readonly<{
        readonly code: LocalDirectoryPickerErrorCode;
        readonly message: string;
        readonly details: readonly string[];
      }>;
    }>;

export type PickerProcessResult = Readonly<{
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}>;

export type PickerProcessRunner = (
  command: string,
  args: readonly string[],
) => Promise<PickerProcessResult>;

export type LocalDirectoryPickerOptions = Readonly<{
  readonly platform?: NodeJS.Platform;
  readonly runProcess?: PickerProcessRunner;
}>;

const POWERSHELL_SCRIPT = [
  "Add-Type -AssemblyName System.Windows.Forms",
  "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
  "$dialog.Description = '选择项目根目录'",
  "$dialog.ShowNewFolderButton = $false",
  "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) }",
].join("; ");

async function runProcess(
  command: string,
  args: readonly string[],
): Promise<PickerProcessResult> {
  try {
    const result = await execFileAsync(command, [...args], {
      windowsHide: false,
      maxBuffer: 1024 * 1024,
      timeout: 5 * 60 * 1000,
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error: unknown) {
    const candidate = error as {
      readonly code?: number | string;
      readonly stdout?: string;
      readonly stderr?: string;
    };
    return {
      exitCode: typeof candidate.code === "number" ? candidate.code : 1,
      stdout: candidate.stdout ?? "",
      stderr: candidate.stderr ?? "",
    };
  }
}

function failure(
  code: LocalDirectoryPickerErrorCode,
  message: string,
  details: readonly string[] = [],
): LocalDirectoryPickerResult {
  return { ok: false, error: { code, message, details } };
}

export function isLoopbackAddress(address: string | undefined): boolean {
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1"
  );
}

export class LocalDirectoryPickerService {
  private readonly platform: NodeJS.Platform;
  private readonly runProcess: PickerProcessRunner;

  public constructor(options: LocalDirectoryPickerOptions = {}) {
    this.platform = options.platform ?? process.platform;
    this.runProcess = options.runProcess ?? runProcess;
  }

  public async select(): Promise<LocalDirectoryPickerResult> {
    if (this.platform !== "win32") {
      return failure(
        "unsupported_platform",
        "本机目录选择器目前只支持 Windows。",
      );
    }

    const processResult = await this.runProcess("powershell.exe", [
      "-NoProfile",
      "-STA",
      "-Command",
      POWERSHELL_SCRIPT,
    ]);
    if (processResult.exitCode !== 0) {
      return failure("picker_failed", "无法打开本机目录选择器。", [
        processResult.stderr.trim() || `exitCode=${processResult.exitCode}`,
      ]);
    }

    const selected = processResult.stdout.trim();
    if (selected.length === 0) {
      return failure("cancelled", "已取消目录选择，未产生任何副作用。");
    }

    if (!win32.isAbsolute(selected) && !isAbsolute(selected)) {
      return failure("invalid_selection", "目录选择器返回的路径无效。", [
        selected,
      ]);
    }

    const projectRoot = normalize(resolve(selected));
    try {
      const stat = await lstat(projectRoot);
      if (!stat.isDirectory()) {
        return failure("invalid_selection", "所选路径不是目录。", [
          projectRoot,
        ]);
      }
    } catch (error: unknown) {
      return failure("invalid_selection", "所选目录不存在或无法访问。", [
        projectRoot,
        error instanceof Error ? error.message : String(error),
      ]);
    }

    return { ok: true, value: { projectRoot } };
  }
}
