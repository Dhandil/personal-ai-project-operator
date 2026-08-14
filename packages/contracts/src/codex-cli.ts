export const codexLoginStatuses = [
  "authenticated",
  "unauthenticated",
  "unknown",
] as const;

export type CodexLoginStatus = (typeof codexLoginStatuses)[number];

export const codexSandboxModes = [
  "elevated",
  "unelevated",
  "unavailable",
] as const;

export type CodexSandboxMode = (typeof codexSandboxModes)[number];

export type CodexCliCommandCapabilities = Readonly<{
  readonly exec: boolean;
  readonly execResume: boolean;
  readonly delete: boolean;
  readonly json: boolean;
  readonly outputSchema: boolean;
  readonly sandboxFlag: boolean;
}>;

export type CodexWindowsSandboxCapabilities = Readonly<{
  readonly nativeWindows: boolean;
  readonly workspaceWrite: boolean;
  readonly readOnly: boolean;
  readonly elevated: boolean | null;
  readonly mode: CodexSandboxMode;
  readonly warning: string | null;
}>;

export type CodexCliPreflightReport = Readonly<{
  readonly schemaVersion: 1;
  readonly checkedAt: string;
  readonly platform: string;
  readonly executable: string;
  readonly installed: boolean;
  readonly version: string | null;
  readonly launchError: string | null;
  readonly login: Readonly<{
    readonly status: CodexLoginStatus;
  }>;
  readonly commands: CodexCliCommandCapabilities;
  readonly sandbox: CodexWindowsSandboxCapabilities;
  readonly canExecute: boolean;
  readonly blockers: readonly string[];
  readonly recommendations: readonly string[];
}>;
