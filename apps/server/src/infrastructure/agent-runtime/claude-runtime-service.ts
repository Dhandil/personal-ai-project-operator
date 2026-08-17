import type {
  AgentCleanupResult,
  AgentControlRequest,
  AgentControlResult,
  AgentResumeRequest,
  AgentRuntime,
  AgentSession,
  AgentStartRequest,
} from "@personal-ai-operator/contracts";

import { AgentRuntimeValidationError } from "./agent-runtime-port.js";
import {
  ClaudeCodeAdapter,
  type ClaudeCodeAdapterOptions,
} from "./claude-code-adapter.js";
import {
  ClaudeCliPreflightService,
  type ClaudeCliPreflightOptions,
  type ClaudeCliPreflightReport,
} from "./claude-cli-preflight.js";

const DEFAULT_RUNTIME_TIMEOUT_MS = 120_000;
const MIN_RUNTIME_TIMEOUT_MS = 1_000;

export type ClaudeRuntimeDiagnostics = ClaudeCliPreflightReport &
  Readonly<{
    readonly runtime: "claude";
    readonly timeoutMs: number;
  }>;

export type ClaudeRuntimeServiceOptions = Readonly<{
  readonly executable?: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly runtimeDirectoryRoot?: string;
  readonly allowProjectPurge?: boolean;
  readonly preflightService?: ClaudeCliPreflightService;
  readonly adapter?: AgentRuntime;
  readonly preflightOptions?: ClaudeCliPreflightOptions;
  readonly adapterOptions?: ClaudeCodeAdapterOptions;
}>;

function configuredTimeout(value: number | undefined): number {
  const candidate =
    value ?? Number(process.env.CLAUDE_RUNTIME_TIMEOUT_MS ?? "");
  return Number.isFinite(candidate) && candidate >= MIN_RUNTIME_TIMEOUT_MS
    ? Math.floor(candidate)
    : DEFAULT_RUNTIME_TIMEOUT_MS;
}

function safeDiagnostics(report: ClaudeCliPreflightReport): string {
  const blockers = report.blockers.join("; ");
  const recommendations = report.recommendations.join("; ");
  return [
    `Claude Runtime preflight failed: ${blockers || "unknown blocker"}`,
    recommendations.length > 0 ? `Recommendations: ${recommendations}` : "",
  ]
    .filter((item) => item.length > 0)
    .join(" ");
}

class PreflightedClaudeRuntime implements AgentRuntime {
  public constructor(
    private readonly adapter: AgentRuntime,
    private readonly preflight: ClaudeCliPreflightService,
    private readonly timeoutMs: number,
  ) {}

  private async ensureReady(): Promise<void> {
    const report = await this.preflight.check();
    if (!report.canExecute) {
      throw new AgentRuntimeValidationError(safeDiagnostics(report));
    }
  }

  private protectTimeout(session: AgentSession): AgentSession {
    const timer = setTimeout(() => {
      void this.adapter
        .cancel({ executionId: session.executionId })
        .catch(() => undefined);
    }, this.timeoutMs);
    void session.result.then(
      () => clearTimeout(timer),
      () => clearTimeout(timer),
    );
    return session;
  }

  public async start(request: AgentStartRequest): Promise<AgentSession> {
    await this.ensureReady();
    return this.protectTimeout(await this.adapter.start(request));
  }

  public async resume(request: AgentResumeRequest): Promise<AgentSession> {
    await this.ensureReady();
    return this.protectTimeout(await this.adapter.resume(request));
  }

  public cancel(request: AgentControlRequest): Promise<AgentControlResult> {
    return this.adapter.cancel(request);
  }

  public cleanup(request: AgentControlRequest): Promise<AgentCleanupResult> {
    return this.adapter.cleanup(request);
  }
}

export class ClaudeRuntimeService {
  public readonly runtime: AgentRuntime;
  private readonly preflight: ClaudeCliPreflightService;
  private readonly timeoutMs: number;

  public constructor(options: ClaudeRuntimeServiceOptions = {}) {
    this.timeoutMs = configuredTimeout(options.timeoutMs);
    const preflightOptions: ClaudeCliPreflightOptions = {
      ...(options.preflightOptions ?? {}),
      ...(options.executable === undefined
        ? {}
        : { executable: options.executable }),
      ...(options.model === undefined ? {} : { model: options.model }),
    };
    this.preflight =
      options.preflightService ??
      new ClaudeCliPreflightService(preflightOptions);
    const adapterOptions: ClaudeCodeAdapterOptions = {
      ...(options.adapterOptions ?? {}),
      ...(options.executable === undefined
        ? {}
        : { executable: options.executable }),
      ...(options.model === undefined ? {} : { model: options.model }),
      ...(options.runtimeDirectoryRoot === undefined
        ? {}
        : { runtimeDirectoryRoot: options.runtimeDirectoryRoot }),
      ...(options.allowProjectPurge === undefined
        ? {}
        : { allowProjectPurge: options.allowProjectPurge }),
    };
    const adapter = options.adapter ?? new ClaudeCodeAdapter(adapterOptions);
    this.runtime = new PreflightedClaudeRuntime(
      adapter,
      this.preflight,
      this.timeoutMs,
    );
  }

  public async diagnostics(): Promise<ClaudeRuntimeDiagnostics> {
    return {
      ...(await this.preflight.check()),
      runtime: "claude",
      timeoutMs: this.timeoutMs,
    };
  }
}

export function createProductionClaudeRuntime(): ClaudeRuntimeService {
  return new ClaudeRuntimeService();
}
