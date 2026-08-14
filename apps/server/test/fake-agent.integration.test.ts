import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  parseFormalId,
  parseUtcIsoTimestamp,
} from "@personal-ai-operator/contracts";
import type {
  AgentEvent,
  AgentStartRequest,
  ExecutionId,
} from "@personal-ai-operator/contracts";

import { FakeAgentAdapter } from "../src/infrastructure/agent-runtime/fake-agent-adapter.js";

const timestamp = parseUtcIsoTimestamp("2026-08-14T13:00:00Z");

const request: AgentStartRequest = {
  taskId: parseFormalId("TASK-035"),
  goalId: parseFormalId("GOAL-008"),
  role: "architect",
  prompt: "Define the runtime boundary.",
  workingDirectory: "temporary-project",
  allowedPaths: ["apps/server/src/infrastructure/agent-runtime"],
  forbiddenPaths: [".personal-workspace/stages"],
  context: [{ key: "acceptance", value: "stable execution IDs" }],
};

async function collect(
  session: Awaited<ReturnType<FakeAgentAdapter["start"]>>,
): Promise<
  Readonly<{
    readonly result: Awaited<typeof session.result>;
    readonly events: readonly AgentEvent[];
  }>
> {
  const events: AgentEvent[] = [];
  for await (const event of session.events) events.push(event);
  return { result: await session.result, events };
}

test("fake adapter covers success and every required failure mode", async () => {
  const adapter = new FakeAgentAdapter({ now: () => timestamp });
  const cases = [
    ["success", "completed"],
    ["failure", "failed"],
    ["interrupted", "interrupted"],
    ["privilege_violation", "privilege_violation"],
    ["review_failed", "review_failed"],
    ["malformed_output", "invalid_output"],
    ["error_output", "failed"],
  ] as const;

  for (const [outcome, expectedStatus] of cases) {
    const session = await adapter.start(request, { outcome });
    const collected = await collect(session);
    assert.equal(collected.result.status, expectedStatus);
    assert.equal(collected.result.executionId, session.executionId);
    assert.ok(collected.events.length >= 2);
    assert.deepEqual(
      collected.events.map((event) => event.sequence),
      collected.events.map((_event, index) => index + 1),
    );
    assert.ok(
      collected.events.every(
        (event) => event.executionId === session.executionId,
      ),
    );
  }
});

test("fake adapter cancels and resumes the same execution with a continued sequence", async () => {
  const adapter = new FakeAgentAdapter({ now: () => timestamp });
  const session = await adapter.start(request, {
    outcome: "success",
  });
  const cancelled = await adapter.cancel({ executionId: session.executionId });
  assert.deepEqual(cancelled, {
    ok: true,
    executionId: session.executionId,
    status: "interrupted",
  });
  const interrupted = await collect(session);
  assert.equal(interrupted.result.status, "interrupted");
  assert.equal(interrupted.events.at(-1)?.type, "interrupted");

  const resumed = await adapter.resume({
    executionId: session.executionId,
    sessionId: session.sessionId ?? "",
    startRequest: request,
  });
  assert.equal(resumed.executionId, session.executionId);
  const resumedResult = await collect(resumed);
  assert.equal(resumedResult.result.status, "completed");
  assert.deepEqual(
    resumedResult.events.map((event) => event.sequence),
    [3, 4, 5],
  );
  assert.equal(resumedResult.events[0]?.type, "started");
});

test("fake adapter reports cleanup failure independently from execution result", async () => {
  const adapter = new FakeAgentAdapter({ now: () => timestamp });
  const session = await adapter.start(request, {
    outcome: "success",
    cleanup: "failure",
  });
  const result = await session.result;
  assert.equal(result.status, "completed");
  const cleanup = await adapter.cleanup({ executionId: session.executionId });
  assert.deepEqual(cleanup, {
    ok: false,
    code: "cleanup_failed",
    executionId: session.executionId,
    message: "The simulated cleanup operation failed.",
  });
});

test("fake adapter rejects invalid requests and unknown control IDs", async () => {
  const adapter = new FakeAgentAdapter({ now: () => timestamp });
  await assert.rejects(
    adapter.start({
      ...request,
      taskId: "TASK-000" as AgentStartRequest["taskId"],
    }),
    /taskId must be a TASK-### identifier/,
  );
  const unknown = "EXEC-999" as ExecutionId;
  const cancelled = await adapter.cancel({ executionId: unknown });
  assert.equal(cancelled.ok, false);
  if (!cancelled.ok) assert.equal(cancelled.code, "not_found");
});
