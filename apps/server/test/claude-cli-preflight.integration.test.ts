import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  ClaudeCliPreflightService,
  type ClaudeProbeCommand,
  type ClaudeProbeResult,
  type ClaudeProbeRunner,
} from "../src/infrastructure/agent-runtime/claude-cli-preflight.js";

function result(stdout: string, exitCode = 0): ClaudeProbeResult {
  return {
    exitCode,
    stdout,
    stderr: exitCode === 0 ? "" : "failed",
    error: exitCode === 0 ? null : "failed",
  };
}

function runner(
  overrides: Readonly<Record<string, ClaudeProbeResult>> = {},
): ClaudeProbeRunner {
  return async (command: ClaudeProbeCommand) => {
    const key = `${command.executable} ${command.args.join(" ")}`;
    if (overrides[key] !== undefined) return overrides[key];
    if (key === "claude --version") return result("Claude Code 2.1.1");
    if (key === "claude --help")
      return result("claude -p --resume --no-session-persistence");
    if (key === "claude -p --help") {
      return result(
        "-p --output-format json stream-json --verbose --resume --no-session-persistence --permission-mode --tools --allowed-tools --disallowed-tools --json-schema",
      );
    }
    if (key === "claude project purge --help")
      return result("claude project purge PATH --yes");
    if (key === "claude auth status --json")
      return result(
        '{"loggedIn":true,"authMethod":"apiKey","apiProvider":"deepseek"}',
      );
    return result("", 1);
  };
}

test("Claude preflight detects DeepSeek auth without exposing credential output", async () => {
  const report = await new ClaudeCliPreflightService({
    executable: "claude",
    now: () => "2026-08-15T09:00:00.000Z",
    runner: runner(),
  }).check();
  assert.equal(report.version, "2.1.1");
  assert.equal(report.loggedIn, true);
  assert.equal(report.authenticationStatus, "authenticated");
  assert.equal(report.provider, "deepseek");
  assert.equal(report.configuredModel, "deepseek-v4-pro");
  assert.equal(report.canExecute, true);
});

test("Claude preflight does not confuse first-party auth metadata with provider or execution capability", async () => {
  const report = await new ClaudeCliPreflightService({
    executable: "claude",
    model: "deepseek-v4-pro",
    runner: runner({
      "claude auth status --json": result(
        '{"loggedIn":true,"authMethod":"oauth","apiProvider":"firstParty"}',
      ),
    }),
  }).check();
  assert.equal(report.loggedIn, true);
  assert.equal(report.authenticationStatus, "authenticated");
  assert.equal(report.provider, "unknown");
  assert.equal(report.configuredModel, "deepseek-v4-pro");
  assert.equal(report.canExecute, true);
  assert.deepEqual(report.blockers, []);
});

test("Claude preflight blocks unknown authentication and missing capabilities", async () => {
  const report = await new ClaudeCliPreflightService({
    executable: "claude",
    runner: runner({
      "claude auth status --json": result("not-json"),
      "claude -p --help": result("-p --output-format text", 0),
    }),
  }).check();
  assert.equal(report.loggedIn, null);
  assert.equal(report.provider, "unknown");
  assert.equal(report.canExecute, false);
  assert.ok(report.blockers.some((item) => /authentication/.test(item)));
  assert.equal(JSON.stringify(report).includes("not-json"), false);
});

test("Claude preflight blocks an empty model configuration without using a CLI default", async () => {
  const report = await new ClaudeCliPreflightService({
    executable: "claude",
    model: "",
    runner: runner(),
  }).check();
  assert.equal(report.loggedIn, true);
  assert.equal(report.configuredModel, null);
  assert.equal(report.canExecute, false);
  assert.ok(report.blockers.includes("No Claude model is configured."));
});
