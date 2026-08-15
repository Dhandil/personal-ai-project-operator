import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  public killedWith: NodeJS.Signals | number | null = null;
  private resolveExit!: (value: CodexProcessExit) => void;

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

test("resume uses the exact thread session ID and keeps the execution ID", async () => {
  const first = new FakeProcess();
  const second = new FakeProcess();
  const commands: CodexExecCommand[] = [];
  const adapter = new CodexCliAdapter({
    now: () => timestamp as UtcIsoTimestamp,
    processFactory: (command) => {
      commands.push(command);
      return commands.length === 1 ? first : second;
    },
  });
  const interrupted = await adapter.start(request);
  first.stdout.write('{"type":"thread.started","thread_id":"thread-resume"}\n');
  first.finish(null, "SIGINT");
  const interruptedResult = await interrupted.result;
  assert.equal(interruptedResult.status, "interrupted");
  assert.equal(interrupted.sessionId, "thread-resume");

  const resumed = await adapter.resume({
    executionId: interrupted.executionId,
    sessionId: interrupted.sessionId ?? "",
    startRequest: request,
  });
  second.stdout.write('{"type":"result","result":{"summary":"resumed"}}\n');
  second.finish();
  const resumedResult = await resumed.result;
  assert.equal(resumedResult.status, "completed");
  assert.equal(resumed.executionId, interrupted.executionId);
  assert.deepEqual(commands[1]?.args, [
    "exec",
    "resume",
    "thread-resume",
    "--json",
    "--cd",
    request.workingDirectory,
    "--sandbox",
    "workspace-write",
    request.prompt,
  ]);
  assert.ok(!commands[1]?.args.includes("--last"));
});

test("a new runtime resumes from the persisted session and task context", async () => {
  const first = new FakeProcess();
  const second = new FakeProcess();
  let firstCommand: CodexExecCommand | null = null;
  let secondCommand: CodexExecCommand | null = null;
  const original = new CodexCliAdapter({
    now: () => timestamp as UtcIsoTimestamp,
    processFactory: (command) => {
      firstCommand = command;
      return first;
    },
  });
  const interrupted = await original.start(request);
  first.stdout.write(
    '{"type":"thread.started","thread_id":"thread-persisted"}\n',
  );
  first.finish(null, "SIGINT");
  assert.equal((await interrupted.result).status, "interrupted");

  const restarted = new CodexCliAdapter({
    now: () => timestamp as UtcIsoTimestamp,
    processFactory: (command) => {
      secondCommand = command;
      return second;
    },
  });
  const resumed = await restarted.resume({
    executionId: interrupted.executionId,
    sessionId: interrupted.sessionId ?? "",
    startRequest: request,
  });
  second.stdout.write(
    '{"type":"result","result":{"summary":"resumed after restart"}}\n',
  );
  second.finish();
  const result = await resumed.result;

  assert.equal(result.status, "completed");
  assert.equal(resumed.executionId, interrupted.executionId);
  assert.equal(firstCommand?.args[0], "exec");
  assert.deepEqual(secondCommand?.args, [
    "exec",
    "resume",
    "thread-persisted",
    "--json",
    "--cd",
    request.workingDirectory,
    "--sandbox",
    "workspace-write",
    request.prompt,
  ]);
});

test("cancel terminates the child process and reports interrupted", async () => {
  const fake = new FakeProcess();
  const captured: { command: CodexExecCommand | null } = { command: null };
  const adapter = adapterWithProcess(fake, captured);
  const session = await adapter.start(request);
  fake.stdout.write('{"type":"thread.started","thread_id":"thread-cancel"}\n');
  const cancelled = await adapter.cancel({ executionId: session.executionId });
  assert.deepEqual(cancelled, {
    ok: true,
    executionId: session.executionId,
    status: "interrupted",
  });
  assert.equal(fake.killedWith, "SIGTERM");
  assert.equal((await session.result).status, "interrupted");
});

test("ephemeral sessions use --ephemeral and do not invoke official deletion", async () => {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-runtime-"));
  try {
    const fake = new FakeProcess();
    const captured: { command: CodexExecCommand | null } = { command: null };
    const adapter = new CodexCliAdapter({
      runtimeDirectoryRoot: root,
      processFactory: (command) => {
        captured.command = command;
        return fake;
      },
    });
    const session = await adapter.start({
      ...request,
      sessionPolicy: "ephemeral",
      runtimeDirectory: join(root, "execution"),
    });
    fake.stdout.write('{"type":"result","result":{"summary":"done"}}\n');
    fake.finish();
    await session.result;

    const cleaned = await adapter.cleanup({ executionId: session.executionId });
    assert.equal(cleaned.ok, true);
    assert.deepEqual(captured.command?.args.slice(0, 2), [
      "exec",
      "--ephemeral",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("persistent cleanup deletes the exact session and reports released runtime bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-runtime-"));
  try {
    const startProcess = new FakeProcess();
    const deleteProcess = new FakeProcess();
    const commands: CodexExecCommand[] = [];
    const runtimeDirectory = join(root, "execution");
    await mkdir(runtimeDirectory, { recursive: true });
    await writeFile(join(runtimeDirectory, "output.txt"), "runtime output\n");
    const adapter = new CodexCliAdapter({
      runtimeDirectoryRoot: root,
      processFactory: (command) => {
        commands.push(command);
        return commands.length === 1 ? startProcess : deleteProcess;
      },
    });
    const session = await adapter.start({ ...request, runtimeDirectory });
    startProcess.stdout.write(
      '{"type":"thread.started","thread_id":"session-to-delete"}\n',
    );
    startProcess.stdout.write('{"type":"result","result":{"ok":true}}\n');
    startProcess.finish();
    await session.result;

    const cleanupPromise = adapter.cleanup({
      executionId: session.executionId,
    });
    deleteProcess.finish();
    const cleaned = await cleanupPromise;
    assert.equal(cleaned.ok, true);
    if (cleaned.ok) assert.ok((cleaned.estimatedFreedBytes ?? 0) > 0);
    assert.deepEqual(commands[1]?.args, [
      "delete",
      "session-to-delete",
      "--force",
    ]);
    await assert.rejects(stat(runtimeDirectory));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("persistent cleanup without thread.started fails and preserves the runtime directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-runtime-"));
  try {
    const fake = new FakeProcess();
    const commands: CodexExecCommand[] = [];
    const runtimeDirectory = join(root, "execution");
    await mkdir(runtimeDirectory, { recursive: true });
    await writeFile(join(runtimeDirectory, "output.txt"), "runtime output\n");
    const adapter = new CodexCliAdapter({
      runtimeDirectoryRoot: root,
      processFactory: (command) => {
        commands.push(command);
        return fake;
      },
    });
    const session = await adapter.start({ ...request, runtimeDirectory });
    fake.stdout.write('{"type":"result","result":{"ok":true}}\n');
    fake.finish();
    await session.result;

    const cleanup = await adapter.cleanup({ executionId: session.executionId });
    assert.equal(cleanup.ok, false);
    if (!cleanup.ok) {
      assert.equal(cleanup.code, "cleanup_failed");
      assert.equal(cleanup.retryable, true);
    }
    assert.equal(commands.length, 1);
    await stat(runtimeDirectory);
    const retry = await adapter.cleanup({ executionId: session.executionId });
    assert.equal(retry.ok, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cleanup failures remain retryable and do not lose the execution record", async () => {
  const first = new FakeProcess();
  const deleteFailure = new FakeProcess();
  const deleteRetry = new FakeProcess();
  const processes = [first, deleteFailure, deleteRetry];
  const commands: CodexExecCommand[] = [];
  const adapter = new CodexCliAdapter({
    processFactory: (command) => {
      commands.push(command);
      return processes.shift() ?? new FakeProcess();
    },
  });
  const session = await adapter.start(request);
  first.stdout.write('{"type":"thread.started","thread_id":"retry-session"}\n');
  first.stdout.write('{"type":"result","result":{"ok":true}}\n');
  first.finish();
  await session.result;

  const firstCleanupPromise = adapter.cleanup({
    executionId: session.executionId,
  });
  deleteFailure.finish(17);
  const firstCleanup = await firstCleanupPromise;
  assert.equal(firstCleanup.ok, false);
  if (!firstCleanup.ok) assert.equal(firstCleanup.code, "cleanup_failed");

  const retryPromise = adapter.cleanup({ executionId: session.executionId });
  deleteRetry.finish();
  const retry = await retryPromise;
  assert.equal(retry.ok, true);
  assert.equal(
    commands.filter((command) => command.args[0] === "delete").length,
    2,
  );
});

test("cleanup rejects runtime directories outside the application runtime root before deletion", async () => {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-runtime-"));
  try {
    const fake = new FakeProcess();
    const commands: CodexExecCommand[] = [];
    const adapter = new CodexCliAdapter({
      runtimeDirectoryRoot: root,
      processFactory: (command) => {
        commands.push(command);
        return fake;
      },
    });
    const session = await adapter.start({
      ...request,
      runtimeDirectory: join(root, "..", "outside-runtime"),
    });
    fake.stdout.write(
      '{"type":"thread.started","thread_id":"path-protected-session"}\n',
    );
    fake.stdout.write('{"type":"result","result":{"ok":true}}\n');
    fake.finish();
    await session.result;

    const cleanup = await adapter.cleanup({ executionId: session.executionId });
    assert.equal(cleanup.ok, false);
    if (!cleanup.ok) {
      assert.equal(cleanup.code, "cleanup_failed");
      assert.equal(cleanup.retryable, false);
    }
    assert.equal(commands.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
