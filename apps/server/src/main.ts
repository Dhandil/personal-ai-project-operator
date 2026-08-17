import { buildApp } from "./app.js";
import { createProductionClaudeRuntime } from "./infrastructure/agent-runtime/claude-runtime-service.js";

const HOST = "127.0.0.1";
const PORT = 4300;

const claudeRuntimeService = createProductionClaudeRuntime();
const app = buildApp({
  claudeRuntimeService,
  agentRuntime: claudeRuntimeService.runtime,
});

try {
  await app.listen({ host: HOST, port: PORT });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
