import { CodexCliPreflightService } from "./codex-cli-preflight.js";

const mode = process.argv[2] ?? "preflight";

if (mode !== "preflight") {
  console.error(`Unknown Codex CLI test mode: ${mode}`);
  process.exitCode = 1;
} else {
  const report = await new CodexCliPreflightService().check();
  console.log(JSON.stringify(report, null, 2));
  if (!report.canExecute) process.exitCode = 2;
}
