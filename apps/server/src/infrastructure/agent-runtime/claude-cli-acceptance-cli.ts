import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { parseFormalId } from "@personal-ai-operator/contracts";
import type {
  AgentSession,
  AgentStartRequest,
  GoalId,
  TaskId,
} from "@personal-ai-operator/contracts";

import { ClaudeCodeAdapter } from "./claude-code-adapter.js";
import { DEFAULT_CLAUDE_MODEL } from "./claude-cli-args.js";
import { ClaudeCliPreflightService } from "./claude-cli-preflight.js";

const DEFAULT_ACCEPTANCE_TIMEOUT_MS = 120_000;
const MIN_ACCEPTANCE_TIMEOUT_MS = 90_000;
const TEMPORARY_CLEANUP_ATTEMPTS = 8;
const TEMPORARY_CLEANUP_DELAY_MS = 250;

const execFileAsync = promisify(execFile);
const outputSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    verified: { type: "boolean" },
    provider: { type: "string" },
  },
  required: ["summary", "verified", "provider"],
  additionalProperties: false,
} as const;

type CaseResult = Readonly<{
  readonly status: "passed" | "failed" | "skipped";
  readonly detail: string;
}>;

type AcceptanceReport = Readonly<{
  readonly schemaVersion: 1;
  readonly checkedAt: string;
  readonly status: "passed" | "failed" | "blocked";
  readonly executable: string;
  readonly version: string | null;
  readonly provider: string;
  readonly configuredModel: string | null;
  readonly timeoutMs: number;
  readonly temporaryProjectCreated: boolean;
  readonly cases: Readonly<Record<string, CaseResult>>;
}>;

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer <redacted>")
    .replace(/(?:sk|api)[-_]?[A-Za-z0-9_-]{12,}/gi, "<redacted>")
    .slice(0, 240);
}

function configuredAcceptanceTimeout(): number {
  const value = Number(process.env.CLAUDE_ACCEPTANCE_TIMEOUT_MS);
  return Number.isFinite(value) && value >= MIN_ACCEPTANCE_TIMEOUT_MS
    ? Math.floor(value)
    : DEFAULT_ACCEPTANCE_TIMEOUT_MS;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function cleanupTemporaryProject(root: string): Promise<CaseResult> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= TEMPORARY_CLEANUP_ATTEMPTS; attempt += 1) {
    try {
      await rm(root, {
        recursive: true,
        force: true,
        maxRetries: 1,
        retryDelay: TEMPORARY_CLEANUP_DELAY_MS,
      });
      return {
        status: "passed",
        detail: `temporary project removed after ${attempt} attempt(s)`,
      };
    } catch (error) {
      lastError = error;
      if (attempt < TEMPORARY_CLEANUP_ATTEMPTS)
        await delay(TEMPORARY_CLEANUP_DELAY_MS * attempt);
    }
  }
  return {
    status: "failed",
    detail: `cleanup_failed attempts=${TEMPORARY_CLEANUP_ATTEMPTS} ${safeError(lastError)}`,
  };
}

async function collect(
  session: AgentSession,
  cancel: () => Promise<void>,
  timeoutMs = 30_000,
): Promise<Awaited<AgentSession["result"]>> {
  const eventsTask = (async (): Promise<void> => {
    for await (const event of session.events) {
      // The Adapter owns event projection; acceptance only needs the final result.
      void event;
    }
  })();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  const outcome = await Promise.race([
    session.result.then((result) => ({ result, timedOut: false as const })),
    timeout.then(() => ({ result: null, timedOut: true as const })),
  ]);
  if (timer !== undefined) clearTimeout(timer);
  if (outcome.timedOut) {
    await cancel();
    await eventsTask;
    return session.result;
  }
  await eventsTask;
  return outcome.result;
}

function resultDetail(result: Awaited<AgentSession["result"]>): string {
  const failure =
    result.error === null
      ? ""
      : ` ${result.error.code}: ${result.error.message}`;
  const stderr =
    typeof result.output?.stderr === "string"
      ? ` stderr=${safeError(result.output.stderr)}`
      : "";
  const diagnostics = result.diagnostics.join(" | ");
  return `${result.status}.${failure}${stderr}${diagnostics.length > 0 ? ` ${safeError(diagnostics)}` : ""}`.slice(
    0,
    480,
  );
}

function request(
  workingDirectory: string,
  role: "executor" | "reviewer",
  prompt: string,
  sessionPolicy: "persistent" | "ephemeral" = "persistent",
): AgentStartRequest {
  return {
    taskId: parseFormalId("TASK-048") as TaskId,
    goalId: parseFormalId("GOAL-009") as GoalId,
    role,
    prompt,
    workingDirectory,
    allowedPaths: ["claude-acceptance.txt"],
    forbiddenPaths: [".git", ".personal-workspace"],
    context: [
      { key: "task", value: "TASK-048" },
      { key: "project", value: "temporary-only" },
    ],
    sessionPolicy,
  };
}

async function runAcceptance(
  preflight: Awaited<ReturnType<ClaudeCliPreflightService["check"]>>,
  timeoutMs: number,
): Promise<AcceptanceReport> {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-claude-acceptance-"));
  const cases: Record<string, CaseResult> = {};
  try {
    await execFileAsync("git", ["init", "-q"], { cwd: root });
    const runtimeRoot = join(root, "runtime");
    const streamAdapter = new ClaudeCodeAdapter({
      executable: preflight.executable,
      model: preflight.configuredModel ?? DEFAULT_CLAUDE_MODEL,
      outputFormat: "stream-json",
      runtimeDirectoryRoot: runtimeRoot,
      allowProjectPurge: true,
    });
    const structuredAdapter = new ClaudeCodeAdapter({
      executable: preflight.executable,
      model: preflight.configuredModel ?? DEFAULT_CLAUDE_MODEL,
      outputFormat: "json",
      jsonSchema: outputSchema,
      runtimeDirectoryRoot: runtimeRoot,
      allowProjectPurge: true,
    });
    const outputPath = join(root, "claude-acceptance.txt");
    const executor = await streamAdapter.start(
      request(
        root,
        "executor",
        "In this temporary Git project only, create claude-acceptance.txt with exactly the text TASK-048 Claude acceptance. Then return structured output with summary, verified=true, and the configured provider. Do not access or change anything outside this directory.",
      ),
    );
    const executorResult = await collect(
      executor,
      async () => {
        await streamAdapter.cancel({ executionId: executor.executionId });
      },
      timeoutMs,
    );
    const output = await readFile(outputPath, "utf8").catch(() => null);
    cases.executor =
      executorResult.status === "completed" &&
      output === "TASK-048 Claude acceptance"
        ? {
            status: "passed",
            detail: "non-interactive write and structured result",
          }
        : {
            status: "failed",
            detail: `executor ${resultDetail(executorResult)}`,
          };
    const executorCleanup = await streamAdapter.cleanup({
      executionId: executor.executionId,
    });
    cases.persistentCleanup = executorCleanup.ok
      ? { status: "passed", detail: "temporary project purge completed" }
      : { status: "failed", detail: executorCleanup.code };

    const beforeReview = await readFile(outputPath, "utf8");
    const reviewer = await structuredAdapter.start(
      request(
        root,
        "reviewer",
        "Read claude-acceptance.txt in this temporary project and return structured output with the observed text, verified=true, and the configured provider. Do not edit, write, delete, or execute shell commands.",
        "ephemeral",
      ),
    );
    const reviewerResult = await collect(
      reviewer,
      async () => {
        await structuredAdapter.cancel({ executionId: reviewer.executionId });
      },
      timeoutMs,
    );
    const afterReview = await readFile(outputPath, "utf8");
    cases.reviewer =
      reviewerResult.status === "completed" && beforeReview === afterReview
        ? { status: "passed", detail: "read-only reviewer preserved the file" }
        : {
            status: "failed",
            detail: `reviewer ${resultDetail(reviewerResult)}`,
          };
    const ephemeralCleanup = await structuredAdapter.cleanup({
      executionId: reviewer.executionId,
    });
    cases.ephemeralCleanup = ephemeralCleanup.ok
      ? { status: "passed", detail: "no persisted session purge required" }
      : { status: "failed", detail: ephemeralCleanup.code };

    const resumeRequest = request(
      root,
      "executor",
      "Wait for five seconds, then return structured output with summary, verified=true, and the configured provider. Do not change files.",
    );
    const resumable = await streamAdapter.start(resumeRequest);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const sessionId = resumable.sessionId;
    if (sessionId !== null) {
      await streamAdapter.cancel({ executionId: resumable.executionId });
      await collect(resumable, async () => undefined, timeoutMs);
      const resumed = await streamAdapter.resume({
        executionId: resumable.executionId,
        sessionId,
        startRequest: resumeRequest,
      });
      const resumedResult = await collect(
        resumed,
        async () => {
          await streamAdapter.cancel({ executionId: resumed.executionId });
        },
        timeoutMs,
      );
      cases.resume =
        resumedResult.status === "completed"
          ? { status: "passed", detail: "exact session resumed" }
          : {
              status: "failed",
              detail: `resume ${resultDetail(resumedResult)}`,
            };
      const cleanup = await streamAdapter.cleanup({
        executionId: resumed.executionId,
      });
      cases.resumeCleanup = cleanup.ok
        ? { status: "passed", detail: "resumed temporary session cleaned" }
        : { status: "failed", detail: cleanup.code };
    } else {
      await streamAdapter.cancel({ executionId: resumable.executionId });
      const canceled = await collect(
        resumable,
        async () => undefined,
        timeoutMs,
      );
      cases.resume = {
        status: "skipped",
        detail: `Claude did not emit a session ID before the cancellation window (${canceled.status})`,
      };
    }
  } catch (error) {
    cases.runtime = { status: "failed", detail: safeError(error) };
  } finally {
    cases.temporaryProjectCleanup = await cleanupTemporaryProject(root);
  }
  const failed = Object.values(cases).some((item) => item.status === "failed");
  return {
    schemaVersion: 1,
    checkedAt: preflight.checkedAt,
    status: failed ? "failed" : "passed",
    executable: preflight.executable,
    version: preflight.version,
    provider: preflight.provider,
    configuredModel: preflight.configuredModel,
    timeoutMs,
    temporaryProjectCreated: true,
    cases,
  };
}

const mode = process.argv[2] ?? "acceptance";
const timeoutMs = configuredAcceptanceTimeout();
const preflightService = new ClaudeCliPreflightService();
const preflight = await preflightService.check();
if (mode === "preflight") {
  console.log(
    JSON.stringify(
      {
        checkedAt: preflight.checkedAt,
        executable: preflight.executable,
        installed: preflight.installed,
        version: preflight.version,
        loggedIn: preflight.loggedIn,
        authenticationStatus: preflight.authenticationStatus,
        provider: preflight.provider,
        configuredModel: preflight.configuredModel,
        commands: preflight.commands,
        canExecute: preflight.canExecute,
        blockers: preflight.blockers,
        recommendations: preflight.recommendations,
      },
      null,
      2,
    ),
  );
  if (!preflight.canExecute) process.exitCode = 2;
} else if (mode === "acceptance") {
  if (!preflight.canExecute) {
    const blocked: AcceptanceReport = {
      schemaVersion: 1,
      checkedAt: preflight.checkedAt,
      status: "blocked",
      executable: preflight.executable,
      version: preflight.version,
      provider: preflight.provider,
      configuredModel: preflight.configuredModel,
      timeoutMs,
      temporaryProjectCreated: false,
      cases: {
        preflight: { status: "failed", detail: preflight.blockers.join("; ") },
      },
    };
    console.log(JSON.stringify(blocked, null, 2));
    process.exitCode = 2;
  } else {
    const report = await runAcceptance(preflight, timeoutMs);
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== "passed") process.exitCode = 1;
  }
} else {
  console.error("Usage: test:claude-cli [preflight|acceptance]");
  process.exitCode = 1;
}
