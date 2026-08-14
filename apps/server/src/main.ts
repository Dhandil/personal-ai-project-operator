import { buildApp } from "./app.js";

const HOST = "127.0.0.1";
const PORT = 4300;

const app = buildApp();

try {
  await app.listen({ host: HOST, port: PORT });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
