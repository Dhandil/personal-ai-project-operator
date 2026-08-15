import { strict as assert } from "node:assert";
import { PassThrough } from "node:stream";
import { test } from "node:test";

import {
  parseFormalId,
  parseUtcIsoTimestamp,
} from "@personal-ai-operator/contracts";
import type {
  AgentEvent,
  AgentStartRequest,
  UtcIsoTimestamp,
} from "@personal-ai-operator/contracts";

import { ClaudeCodeAdapter } from "../src/infrastructure/agent-runtime/claude-code-adapter.js";
import type { ClaudeCommand } from "../src/infrastructure/agent-runtime/claude-cli-args.js";
import type {
  ClaudeProcess,
  ClaudeProcessExit,
} from "../src/infrastructure/agent-runtime/claude-process.js";

const timestamp = parseUtcIsoTimestamp("2026-08-15T09:00:00Z");
const request: AgentStartRequest = {
  taskId: parseFormalId("TASK-048"),
  goalId: parseFormalId("GOAL-009"),
  role: "executor",
  prompt: "Create only the requested file in this temporary project.",
  workingDirectory: "C:\\tmp\\claude-task-048",
  allowedPaths: ["claude-output.txt"],
  forbiddenPaths: [".git", ".personal-workspace"],
  context: [{ key: "task", value: "TASK-048" }],
};

class FakeProcess implements ClaudeProcess {
  public readonly stdout = new PassThrough();
  public readonly stderr = new PassThrough();
  public readonly pid = 94048;
  public readonly exit: Promise<ClaudeProcessExit>;
  public killedWith: NodeJS.Signals | number | null = null;
  private resolveExit!: (value: ClaudeProcessExit) => void;

  public constructor() {
    this.exit = new Promise((resolve) => {
      this.resolveExit = resolve;
    });
  }

  public finish(
    code: number | null = 0,
    signal: NodeJS.Signals | null = null,
  ): void {
    this.stdout.end();
    this.stderr.end();
    this.resolveExit({ code, signal, error: null });
  }

  public kill(signal: NodeJS.Signals | number = "SIGTERM"): boolean {
    this.killedWith = signal;
    this.finish(null, typeof signal === "string" ? signal : null);
    return true;
  }
}

async function collect(
  session: Awaited<ReturnType<ClaudeCodeAdapter["start"]>>,
): Promise<
  Readonly<{
    readonly events: readonly AgentEvent[];
    readonly result: Awaited<typeof session.result>;
  }>
> {
  const events: AgentEvent[] = [];
  for await (const event of session.events) events.push(event);
  return { events, result: await session.result };
}

test("Claude adapter uses non-interactive stream JSON and executor tool boundary", async () => {
  const fake = new FakeProcess();
  let command: ClaudeCommand | null = null;
  const adapter = new ClaudeCodeAdapter({
    model: "deepseek-v4-pro",
    now: () => timestamp as UtcIsoTimestamp,
    processFactory: (value) => {
      command = value;
      return fake;
    },
  });
  const session = await adapter.start(request);
  fake.stdout.write('{"type":"system","session_id":"claude-session-048"}\n');
  fake.stdout.write('{"type":"assistant","message":"writing"}\n');
  fake.stdout.write(
    '{"type":"result","session_id":"claude-session-048","result":{"summary":"done","verified":true}}\n',
  );
  fake.finish();
  const collected = await collect(session);

  assert.equal(collected.result.status, "completed");
  assert.equal(collected.result.output?.summary, "done");
  assert.equal(session.sessionId, "claude-session-048");
  assert.equal(command?.workingDirectory, request.workingDirectory);
  assert.equal(command?.permissionMode, "acceptEdits");
  assert.equal(command?.args[0], "-p");
  assert.equal(command?.args[1], request.prompt);
  assert.ok(command?.args.includes("--output-format"));
  assert.ok(command?.args.includes("stream-json"));
  assert.ok(command?.args.includes("--permission-mode"));
  assert.ok(command?.args.includes("acceptEdits"));
  assert.ok(command?.args.includes("--model"));
  assert.ok(command?.args.includes("deepseek-v4-pro"));
  assert.ok(command?.args.includes("--tools"));
  assert.ok(command?.args.includes("Read,Edit,Write,Bash"));
  assert.ok(command?.args.includes("--allowed-tools"));
  assert.ok(
    collected.events.some(
      (event) => event.data.sessionId === "claude-session-048",
    ),
  );
});

test("Claude adapter supports one-document JSON output and read-only reviewer tools", async () => {
  const fake = new FakeProcess();
  let command: ClaudeCommand | null = null;
  const adapter = new ClaudeCodeAdapter({
    outputFormat: "json",
    now: () => timestamp as UtcIsoTimestamp,
    processFactory: (value) => {
      command = value;
      return fake;
    },
  });
  const session = await adapter.start({ ...request, role: "reviewer" });
  fake.stdout.write(
    '{"type":"result","session_id":"review-session","result":{"approved":true}}',
  );
  fake.finish();
  const collected = await collect(session);

  assert.equal(collected.result.status, "completed");
  assert.equal(collected.result.output?.approved, true);
  assert.equal(command?.permissionMode, "plan");
  assert.ok(command?.args.includes("--model"));
  assert.ok(command?.args.includes("deepseek-v4-pro"));
  assert.ok(command?.args.includes("--tools"));
  assert.ok(command?.args.includes("Read"));
  const reviewerToolsIndex = command?.args.indexOf("--tools") ?? -1;
  assert.equal(command?.args[reviewerToolsIndex + 1], "Read");
  assert.ok(command?.args.includes("--disallowed-tools"));
  assert.ok(command?.args.includes("Edit,Write,NotebookEdit,Bash,PowerShell"));
});

test("Claude adapter resumes a precise session in a new runtime", async () => {
  const first = new FakeProcess();
  const second = new FakeProcess();
  let secondCommand: ClaudeCommand | null = null;
  const original = new ClaudeCodeAdapter({
    now: () => timestamp as UtcIsoTimestamp,
    processFactory: () => first,
  });
  const interrupted = await original.start(request);
  first.stdout.write('{"type":"system","session_id":"resume-session"}\n');
  first.finish(null, "SIGINT");
  assert.equal((await interrupted.result).status, "interrupted");

  const restarted = new ClaudeCodeAdapter({
    now: () => timestamp as UtcIsoTimestamp,
    processFactory: (command) => {
      secondCommand = command;
      return second;
    },
  });
  const resumed = await restarted.resume({
    executionId: interrupted.executionId,
    sessionId: "resume-session",
    startRequest: request,
  });
  second.stdout.write(
    '{"type":"result","session_id":"resume-session","result":{"summary":"resumed"}}\n',
  );
  second.finish();
  assert.equal((await resumed.result).status, "completed");
  assert.equal(resumed.executionId, interrupted.executionId);
  assert.equal(secondCommand?.args[0], "-p");
  assert.equal(secondCommand?.args[1], request.prompt);
  assert.ok(secondCommand?.args.includes("--output-format"));
  assert.ok(secondCommand?.args.includes("stream-json"));
  assert.ok(secondCommand?.args.includes("--permission-mode"));
  assert.ok(secondCommand?.args.includes("acceptEdits"));
  assert.ok(secondCommand?.args.includes("--resume"));
  assert.ok(secondCommand?.args.includes("resume-session"));
});

test("unrecognized_model is retained as a non-fatal diagnostic when execution succeeds", async () => {
  const fake = new FakeProcess();
  const adapter = new ClaudeCodeAdapter({ processFactory: () => fake });
  const session = await adapter.start(request);
  fake.stdout.write(
    '{"type":"error","error":{"type":"unrecognized_model","message":"model metadata is not recognized"}}\n',
  );
  fake.stderr.write(
    '[claude-code:unrecognized_model] {"model":"deepseek-v4-pro"}\n',
  );
  fake.stdout.write(
    '{"type":"result","session_id":"diagnostic-session","result":{"summary":"ok"}}\n',
  );
  fake.finish();
  const collected = await collect(session);

  assert.equal(collected.result.status, "completed");
  assert.equal(collected.result.error, null);
  assert.ok(
    collected.result.diagnostics.some((item) =>
      item.includes("unrecognized_model"),
    ),
  );
  assert.ok(
    collected.events.some(
      (event) => event.type === "error_output" && event.data.nonFatal === true,
    ),
  );
});

test("ephemeral cleanup disables persistence and persistent cleanup uses project purge", async () => {
  const ephemeral = new FakeProcess();
  let ephemeralCommand: ClaudeCommand | null = null;
  const ephemeralAdapter = new ClaudeCodeAdapter({
    processFactory: (command) => {
      ephemeralCommand = command;
      return ephemeral;
    },
  });
  const ephemeralSession = await ephemeralAdapter.start({
    ...request,
    sessionPolicy: "ephemeral",
  });
  ephemeral.stdout.write(
    '{"type":"result","result":{"summary":"ephemeral"}}\n',
  );
  ephemeral.finish();
  await ephemeralSession.result;
  assert.equal(
    (
      await ephemeralAdapter.cleanup({
        executionId: ephemeralSession.executionId,
      })
    ).ok,
    true,
  );
  assert.ok(ephemeralCommand?.args.includes("--no-session-persistence"));

  const start = new FakeProcess();
  const purge = new FakeProcess();
  const commands: ClaudeCommand[] = [];
  const persistentAdapter = new ClaudeCodeAdapter({
    allowProjectPurge: true,
    processFactory: (command) => {
      commands.push(command);
      return commands.length === 1 ? start : purge;
    },
  });
  const persistentSession = await persistentAdapter.start(request);
  start.stdout.write('{"type":"system","session_id":"purge-session"}\n');
  start.stdout.write('{"type":"result","result":{"summary":"persistent"}}\n');
  start.finish();
  await persistentSession.result;
  const cleanupPromise = persistentAdapter.cleanup({
    executionId: persistentSession.executionId,
  });
  purge.finish();
  assert.equal((await cleanupPromise).ok, true);
  assert.deepEqual(commands[1]?.args.slice(0, 3), [
    "project",
    "purge",
    request.workingDirectory,
  ]);
});
