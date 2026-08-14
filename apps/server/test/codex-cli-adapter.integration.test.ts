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

import {
  CodexCliAdapter,
  type CodexCliAdapterOptions,
} from "../src/infrastructure/agent-runtime/codex-cli-adapter.js";
import type { CodexExecCommand } from "../src/infrastructure/agent-runtime/codex-exec-args.js";
import type {
  CodexProcess,
  CodexProcessExit,
} from "../src/infrastructure/agent-runtime/codex-process.js";

const timestamp = parseUtcIsoTimestamp("2026-08-15T09:00:00Z");
const request: AgentStartRequest = {
  taskId: parseFormalId("TASK-039"),
  goalId: parseFormalId("GOAL-008"),
  role: "executor",
  prompt: "Implement the assigned task.",
  workingDirectory: "C:\\worktrees\\TASK-039",
  allowedPaths: ["apps/server/src"],
  forbiddenPaths: [".git", ".personal-workspace"],
  context: [{ key: "task", value: "TASK-039" }],
};

class FakeProcess implements CodexProcess {
  public readonly stdout = new PassThrough();
  public readonly stderr = new PassThrough();
  public readonly pid = 4321;
  public readonly exit: Promise<CodexProcessExit>;
  private resolveExit!: (value: CodexProcessExit) => void;

  public constructor() {
    this.exit = new Promise((resolve) => {
      this.resolveExit = resolve;
    });
  }

  public finish(code = 0, signal: NodeJS.Signals | null = null): void {
    this.stdout.end();
    this.stderr.end();
    this.resolveExit({ code, signal, error: null });
  }
}

async function collect(
  session: Awaited<ReturnType<CodexCliAdapter["start"]>>,
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

function adapterWithProcess(
  fake: FakeProcess,
  captured: { command: CodexExecCommand | null },
): CodexCliAdapter {
  const options: CodexCliAdapterOptions = {
    now: () => timestamp as UtcIsoTimestamp,
    processFactory: (command) => {
      captured.command = command;
      return fake;
    },
  };
  return new CodexCliAdapter(options);
}

test("Codex adapter starts with safe args and parses split JSONL events", async () => {
  const fake = new FakeProcess();
  const captured: { command: CodexExecCommand | null } = { command: null };
  const sessionPromise = adapterWithProcess(fake, captured).start(request);
  const session = await sessionPromise;
  fake.stdout.write('{"type":"thread.started","thread_id":"thread-039"}\n');
  fake.stdout.write(
    '{"type":"item.started","item":{"type":"command_execution","command":"npm test"}}\n',
  );
  fake.stdout.write(
    '{"type":"item.completed","item":{"type":"file_change","changes":[{"path":"apps/server/src/task.ts"}]}}\n',
  );
  const message =
    '{"type":"result","result":{"summary":"done","verified":true}}\n';
  fake.stdout.write(message.slice(0, 17));
  fake.stdout.write(message.slice(17));
  fake.stderr.write("diagnostic\n");
  fake.finish();

  const collected = await collect(session);
  assert.equal(collected.result.status, "completed");
  assert.equal(collected.result.output?.summary, "done");
  assert.equal(collected.result.output?.verified, true);
  assert.equal(collected.result.output?.threadId, "thread-039");
  assert.equal(collected.result.output?.pid, 4321);
  assert.match(String(collected.result.output?.fileChanges), /task.ts/);
  assert.equal(collected.result.output?.stderr, "diagnostic\n");
  assert.equal(collected.events[0]?.type, "started");
  assert.ok(
    collected.events.some((event) => event.data.threadId === "thread-039"),
  );
  assert.ok(
    collected.events.some((event) => event.data.command === "npm test"),
  );
  assert.deepEqual(captured.command, {
    executable: "codex",
    args: [
      "exec",
      "--json",
      "--cd",
      request.workingDirectory,
      "--sandbox",
      "workspace-write",
      request.prompt,
    ],
    workingDirectory: request.workingDirectory,
    sandbox: "workspace-write",
  });
  assert.ok(!captured.command.args.includes("-p"));
  assert.ok(!captured.command.args.includes("danger-full-access"));
  assert.deepEqual(
    collected.events.map((event) => event.sequence),
    collected.events.map((_event, index) => index + 1),
  );
});

test("reviewer runs in the exact worktree with read-only sandbox", async () => {
  const fake = new FakeProcess();
  const captured: { command: CodexExecCommand | null } = { command: null };
  const session = await adapterWithProcess(fake, captured).start({
    ...request,
    role: "reviewer",
  });
  fake.stdout.write('{"type":"result","result":{"approved":true}}\n');
  fake.finish();
  const collected = await collect(session);
  assert.equal(collected.result.status, "completed");
  assert.equal(captured.command?.workingDirectory, request.workingDirectory);
  assert.equal(captured.command?.sandbox, "read-only");
  assert.equal(captured.command?.args.at(-2), "read-only");
});

test("malformed and structurally invalid JSONL become invalid output", async () => {
  for (const line of ["not-json\n", "[]\n", '{"message":"missing type"}\n']) {
    const fake = new FakeProcess();
    const captured: { command: CodexExecCommand | null } = { command: null };
    const session = await adapterWithProcess(fake, captured).start(request);
    fake.stdout.write(line);
    fake.finish();
    const collected = await collect(session);
    assert.equal(collected.result.status, "invalid_output");
    assert.equal(collected.result.error?.code, "malformed_output");
  }
});

test("nonzero process exit captures stderr and fails execution", async () => {
  const fake = new FakeProcess();
  const captured: { command: CodexExecCommand | null } = { command: null };
  const session = await adapterWithProcess(fake, captured).start(request);
  fake.stdout.write('{"type":"thread.started","thread_id":"thread-fail"}\n');
  fake.stderr.write("permission denied\n");
  fake.finish(17);
  const collected = await collect(session);
  assert.equal(collected.result.status, "failed");
  assert.equal(collected.result.error?.code, "error_output");
  assert.match(collected.result.diagnostics.join("\n"), /permission denied/);
  assert.equal(collected.result.output?.stderr, "permission denied\n");
});
