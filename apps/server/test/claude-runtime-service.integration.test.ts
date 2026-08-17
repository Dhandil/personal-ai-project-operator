import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  parseFormalId,
  parseUtcIsoTimestamp,
} from "@personal-ai-operator/contracts";
import type {
  AgentCleanupResult,
  AgentControlResult,
  AgentEvent,
  AgentRuntime,
  AgentSession,
  AgentStartRequest,
} from "@personal-ai-operator/contracts";

import { buildApp } from "../src/app.js";
import {
  ClaudeRuntimeService,
  type ClaudeRuntimeServiceOptions,
} from "../src/infrastructure/agent-runtime/claude-runtime-service.js";
import { ClaudeCliPreflightService } from "../src/infrastructure/agent-runtime/claude-cli-preflight.js";
import type {
  ClaudeProbeCommand,
  ClaudeProbeResult,
  ClaudeProbeRunner,
} from "../src/infrastructure/agent-runtime/claude-cli-preflight.js";

const timestamp = parseUtcIsoTimestamp("2026-08-17T09:00:00Z");
const request: AgentStartRequest = {
  taskId: parseFormalId("TASK-085"),
  goalId: parseFormalId("GOAL-016"),
  role: "executor",
  prompt: "Run only inside this temporary project.",
  workingDirectory: "C:\\tmp\\task-085",
  allowedPaths: ["acceptance.txt"],
  forbiddenPaths: [".git", ".personal-workspace"],
  context: [{ key: "task", value: "TASK-085" }],
};

function result(stdout: string, exitCode = 0): ClaudeProbeResult {
  return {
    exitCode,
    stdout,
    stderr: exitCode === 0 ? "" : "probe failed",
    error: exitCode === 0 ? null : "probe failed",
  };
}

function runner(
  auth = '{"loggedIn":true,"authMethod":"oauth","apiProvider":"firstParty"}',
): ClaudeProbeRunner {
  return async (command: ClaudeProbeCommand) => {
    const key = `${command.executable} ${command.args.join(" ")}`;
    if (key === "claude --version") return result("Claude Code 2.1.233");
    if (key === "claude --help") {
      return result("claude -p --resume --no-session-persistence");
    }
    if (key === "claude -p --help") {
      return result(
        "-p --output-format json stream-json --verbose --resume --no-session-persistence --permission-mode --tools --allowed-tools --disallowed-tools --json-schema",
      );
    }
    if (key === "claude project purge --help") {
      return result("claude project purge PATH --yes");
    }
    if (key === "claude auth status --json") return result(auth);
    return result("", 1);
  };
}

function session(): AgentSession {
  const event: AgentEvent = {
    executionId: parseFormalId("EXEC-085"),
    sequence: 1,
    occurredAt: timestamp,
    type: "started",
    message: "started",
    data: { sessionId: "claude-session-085" },
  };
  return {
    executionId: parseFormalId("EXEC-085"),
    sessionId: "claude-session-085",
    events: (async function* () {
      yield event;
    })(),
    result: Promise.resolve({
      executionId: parseFormalId("EXEC-085"),
      status: "completed",
      output: { verified: true },
      error: null,
      diagnostics: [],
    }),
  };
}

function adapter(calls: { starts: number }): AgentRuntime {
  const control: AgentControlResult = {
    ok: false,
    code: "not_running",
    executionId: parseFormalId("EXEC-085"),
    message: "not running",
  };
  const cleanup: AgentCleanupResult = {
    ok: true,
    executionId: parseFormalId("EXEC-085"),
    status: "cleaned",
  };
  return {
    start: async () => {
      calls.starts += 1;
      return session();
    },
    resume: async () => session(),
    cancel: async () => control,
    cleanup: async () => cleanup,
  };
}

function service(
  options: Readonly<{
    readonly auth?: string;
    readonly calls?: { starts: number };
  }> = {},
): ClaudeRuntimeService {
  const preflightService = new ClaudeCliPreflightService({
    executable: "claude",
    model: "deepseek-v4-pro",
    now: () => timestamp,
    runner: runner(options.auth),
  });
  const calls = options.calls ?? { starts: 0 };
  const serviceOptions: ClaudeRuntimeServiceOptions = {
    preflightService,
    adapter: adapter(calls),
    timeoutMs: 90_000,
  };
  return new ClaudeRuntimeService(serviceOptions);
}

test("Claude Runtime runs only after a successful preflight and exposes safe diagnostics", async () => {
  const calls = { starts: 0 };
  const runtimeService = service({ calls });
  const diagnostics = await runtimeService.diagnostics();
  assert.equal(diagnostics.runtime, "claude");
  assert.equal(diagnostics.configuredModel, "deepseek-v4-pro");
  assert.equal(diagnostics.authenticationStatus, "authenticated");
  assert.equal(diagnostics.provider, "unknown");
  assert.equal(diagnostics.canExecute, true);
  assert.equal(diagnostics.timeoutMs, 90_000);
  assert.equal(JSON.stringify(diagnostics).includes("oauth"), false);

  const started = await runtimeService.runtime.start(request);
  assert.equal(started.sessionId, "claude-session-085");
  assert.equal(calls.starts, 1);
});

test("Claude Runtime blocks execution when authentication is unknown", async () => {
  const calls = { starts: 0 };
  const runtimeService = service({
    calls,
    auth: "not-json-credential-output",
  });
  const diagnostics = await runtimeService.diagnostics();
  assert.equal(diagnostics.canExecute, false);
  assert.equal(diagnostics.authenticationStatus, "unknown");
  assert.equal(JSON.stringify(diagnostics).includes("not-json"), false);
  await assert.rejects(
    runtimeService.runtime.start(request),
    /Claude Runtime preflight failed/,
  );
  assert.equal(calls.starts, 0);
});

test("Web exposes Claude Runtime diagnostics without changing project facts", async (t) => {
  const runtimeService = service();
  const app = buildApp({ claudeRuntimeService: runtimeService });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/runtime/claude/preflight",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    value: await runtimeService.diagnostics(),
  });
});
