import Fastify, { type FastifyInstance } from "fastify";

const SERVICE_NAME = "@personal-ai-operator/server";

export type HealthResponse = Readonly<{
  readonly status: "ok";
  readonly service: typeof SERVICE_NAME;
}>;

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async (): Promise<HealthResponse> => ({
    status: "ok",
    service: SERVICE_NAME,
  }));

  return app;
}
