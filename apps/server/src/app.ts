import Fastify, { type FastifyInstance } from "fastify";

import {
  ProjectInitializationPreviewService,
  type ProjectInitializationPreviewInput,
} from "./infrastructure/initialization/project-init-preview.js";
import { ProjectInitializationService } from "./infrastructure/initialization/project-initialization.js";
import {
  ProjectQueryService,
  ProjectStartupService,
} from "./infrastructure/projects/project-startup.js";

const SERVICE_NAME = "@personal-ai-operator/server";

export type HealthResponse = Readonly<{
  readonly status: "ok";
  readonly service: typeof SERVICE_NAME;
}>;

export type AppOptions = Readonly<{
  readonly projectInitializationService?: ProjectInitializationService;
  readonly projectQueryService?: ProjectQueryService;
  readonly projectStartupService?: ProjectStartupService;
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

  const projectQueryService =
    options.projectQueryService ?? new ProjectQueryService();
  const projectStartupService =
    options.projectStartupService ??
    new ProjectStartupService({ queryService: projectQueryService });

  app.get("/api/projects", async (_request, reply) => {
    const result = await projectQueryService.list();
    return reply.code(result.ok ? 200 : 500).send(result);
  });

  app.put<{ Body: { readonly projectKey?: unknown } }>(
    "/api/projects/current",
    async (request, reply) => {
      const projectKey = request.body?.projectKey;
      if (typeof projectKey !== "string") {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "project_not_found",
            message: "A project key is required.",
            details: [],
          },
        });
      }
      const result = await projectQueryService.selectCurrent(projectKey);
      return reply.code(result.ok ? 200 : 400).send(result);
    },
  );

  app.post<{ Body: { readonly projectKey?: unknown } }>(
    "/api/projects/startup",
    async (request, reply) => {
      const projectKey = request.body?.projectKey;
      if (projectKey !== undefined && typeof projectKey !== "string") {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "project_not_found",
            message: "Project key must be a string when provided.",
            details: [],
          },
        });
      }
      const result = await projectStartupService.start(projectKey);
      return reply.code(result.ok ? 200 : 400).send(result);
    },
  );

  return app;
}
