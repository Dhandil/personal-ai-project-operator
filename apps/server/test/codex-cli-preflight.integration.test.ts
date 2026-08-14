import { strict as assert } from "node:assert";
import { test } from "node:test";

import { buildApp } from "../src/app.js";
import {
  CodexCliPreflightService,
  type CodexProbeCommand,
  type CodexProbeProcessResult,
  type CodexProbeRunner,
} from "../src/infrastructure/agent-runtime/codex-cli-preflight.js";

const checkedAt = "2026-08-15T02:00:00.000Z";

function result(stdout: string, exitCode = 0): CodexProbeProcessResult {
  return {
    exitCode,
    stdout,
    stderr: exitCode === 0 ? "" : "command failed",
    error: exitCode === 0 ? null : "command failed",
  };
}

function simulatedRunner(
  overrides: Readonly<Record<string, CodexProbeProcessResult>> = {},
): CodexProbeRunner {
  return async (command: CodexProbeCommand) => {
    const key = `${command.executable} ${command.args.join(" ")}`;
    if (overrides[key] !== undefined) return overrides[key];
    if (key === "codex --version") return result("codex-cli 0.133.0");
    if (key === "codex exec --help") {
      return result(
        "codex exec --json --output-schema FILE --sandbox read-only|workspace-write",
      );
    }
    if (key === "codex exec resume --help") {
      return result("codex exec resume SESSION_ID");
    }
    if (key === "codex delete --help")
      return result("codex delete UUID --force");
    if (key === "codex login status") return result("Logged in using ChatGPT");
    return result("", 1);
  };
}

test("preflight reports an elevated Windows environment with required capabilities", async () => {
  const service = new CodexCliPreflightService({
    platform: "win32",
    now: () => checkedAt,
    runner: simulatedRunner(),
    elevationProbe: async () => true,
  });

  const report = await service.check();

  assert.equal(report.checkedAt, checkedAt);
  assert.equal(report.version, "0.133.0");
  assert.equal(report.login.status, "authenticated");
  assert.deepEqual(report.commands, {
    exec: true,
    execResume: true,
    delete: true,
    json: true,
    outputSchema: true,
    sandboxFlag: true,
  });
  assert.equal(report.sandbox.mode, "elevated");
  assert.equal(report.canExecute, true);
  assert.deepEqual(report.blockers, []);
});

test("preflight blocks missing installation and gives an install recommendation", async () => {
  const service = new CodexCliPreflightService({
    platform: "win32",
    runner: async () => result("", 1),
  });

  const report = await service.check();

  assert.equal(report.installed, false);
  assert.equal(report.canExecute, false);
  assert.match(report.blockers[0] ?? "", /not installed/);
  assert.ok(
    report.recommendations.some((item) => /Install Codex CLI/.test(item)),
  );
});

test("preflight blocks unauthenticated execution without exposing credential output", async () => {
  const service = new CodexCliPreflightService({
    platform: "win32",
    runner: simulatedRunner({
      "codex login status": result("Not logged in", 1),
    }),
    elevationProbe: async () => false,
  });

  const report = await service.check();

  assert.equal(report.login.status, "unauthenticated");
  assert.equal(report.canExecute, false);
  assert.ok(report.blockers.some((item) => /not logged in/.test(item)));
  assert.ok(report.recommendations.some((item) => /codex login/.test(item)));
  assert.equal(JSON.stringify(report).includes("Not logged in"), false);
  assert.equal(report.sandbox.mode, "unelevated");
  assert.match(report.sandbox.warning ?? "", /unelevated/);
});

test("preflight blocks when required commands or sandbox flags are missing", async () => {
  const service = new CodexCliPreflightService({
    platform: "win32",
    runner: simulatedRunner({
      "codex exec --help": result("codex exec --json"),
      "codex exec resume --help": result("", 1),
      "codex delete --help": result("", 1),
    }),
    elevationProbe: async () => true,
  });

  const report = await service.check();

  assert.equal(report.canExecute, false);
  assert.ok(
    report.blockers.some((item) => /Required Codex CLI commands/.test(item)),
  );
  assert.ok(
    report.blockers.some((item) => /JSONL and output-schema/.test(item)),
  );
  assert.equal(report.sandbox.mode, "unavailable");
});

test("preflight is exposed through a read-only diagnostic route", async (t) => {
  const service = new CodexCliPreflightService({
    platform: "win32",
    now: () => checkedAt,
    runner: simulatedRunner(),
    elevationProbe: async () => true,
  });
  const app = buildApp({ codexCliPreflightService: service });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/runtime/codex/preflight",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    value: await service.check(),
  });
});
