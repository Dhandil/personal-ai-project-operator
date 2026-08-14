import Fastify, { type FastifyInstance } from "fastify";

import {
  ProjectInitializationPreviewService,
  type ProjectInitializationPreviewInput,
} from "./infrastructure/initialization/project-init-preview.js";
import { ProjectInitializationService } from "./infrastructure/initialization/project-initialization.js";

const SERVICE_NAME = "@personal-ai-operator/server";

export type HealthResponse = Readonly<{
  readonly status: "ok";
  readonly service: typeof SERVICE_NAME;
}>;

export type AppOptions = Readonly<{
  readonly projectInitializationService?: ProjectInitializationService;
}>;

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async (): Promise<HealthResponse> => ({
    status: "ok",
    service: SERVICE_NAME,
  }));

  const previewService = new ProjectInitializationPreviewService();
  app.post<{ Body: ProjectInitializationPreviewInput }>(
    "/api/projects/preview",
    async (request, reply) => {
      const result = await previewService.preview(request.body);
      return reply.code(result.ok ? 200 : 400).send(result);
    },
  );

  const initializationService =
    options.projectInitializationService ?? new ProjectInitializationService();
  app.post("/api/projects/initialize", async (request, reply) => {
    const result = await initializationService.execute(request.body);
    return reply.code(result.ok ? 200 : 400).send(result);
  });

  return app;
}
