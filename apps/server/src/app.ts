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
import { WorkflowService } from "./infrastructure/workflow/workflow-service.js";
import { GoalService } from "./infrastructure/goals/goal-service.js";
import { RoleService } from "./infrastructure/roles/role-service.js";
import { IssueService } from "./infrastructure/issues/issue-service.js";
import { ReportService } from "./infrastructure/reports/report-service.js";
import { SettingsService } from "./infrastructure/reports/settings-service.js";

const SERVICE_NAME = "@personal-ai-operator/server";

export type HealthResponse = Readonly<{
  readonly status: "ok";
  readonly service: typeof SERVICE_NAME;
}>;

export type AppOptions = Readonly<{
  readonly projectInitializationService?: ProjectInitializationService;
  readonly projectQueryService?: ProjectQueryService;
  readonly projectStartupService?: ProjectStartupService;
  readonly workflowService?: WorkflowService;
  readonly goalService?: GoalService;
  readonly roleService?: RoleService;
  readonly issueService?: IssueService;
  readonly reportService?: ReportService;
  readonly settingsService?: SettingsService;
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
  const workflowService = options.workflowService ?? new WorkflowService();
  const goalService = options.goalService ?? new GoalService();
  const roleService = options.roleService ?? new RoleService();
  const issueService = options.issueService ?? new IssueService();
  const reportService = options.reportService ?? new ReportService();
  const settingsService = options.settingsService ?? new SettingsService();

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

  app.get<{ Querystring: { readonly projectKey?: unknown } }>(
    "/api/projects/workflow",
    async (request, reply) => {
      const projectKey = request.query?.projectKey;
      if (typeof projectKey !== "string") {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "invalid_input",
            message: "A project key is required.",
            details: [],
          },
        });
      }
      const result = await workflowService.getWorkflow(projectKey);
      return reply
        .code(
          result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
        )
        .send(result);
    },
  );

  app.post("/api/projects/workflow/skip-proposal", async (request, reply) => {
    const result = await workflowService.proposeSkip(request.body);
    return reply
      .code(
        result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
      )
      .send(result);
  });

  app.post("/api/projects/workflow/skip-decision", async (request, reply) => {
    const result = await workflowService.decideSkip(request.body);
    return reply
      .code(
        result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
      )
      .send(result);
  });

  app.get<{ Querystring: { readonly projectKey?: unknown } }>(
    "/api/projects/goals",
    async (request, reply) => {
      const projectKey = request.query?.projectKey;
      if (typeof projectKey !== "string") {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "invalid_input",
            message: "A project key is required.",
            details: [],
          },
        });
      }
      const result = await goalService.getGoals(projectKey);
      return reply
        .code(
          result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
        )
        .send(result);
    },
  );

  app.post("/api/projects/goals/propose", async (request, reply) => {
    const result = await goalService.propose(request.body);
    return reply
      .code(
        result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
      )
      .send(result);
  });

  app.post("/api/projects/goals/decision", async (request, reply) => {
    const result = await goalService.decide(request.body);
    return reply
      .code(
        result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
      )
      .send(result);
  });

  app.get<{ Querystring: { readonly projectKey?: unknown } }>(
    "/api/projects/roles",
    async (request, reply) => {
      const projectKey = request.query?.projectKey;
      if (typeof projectKey !== "string") {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "invalid_input",
            message: "A project key is required.",
            details: [],
          },
        });
      }
      const result = await roleService.getRoles(projectKey);
      return reply
        .code(
          result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
        )
        .send(result);
    },
  );

  app.post("/api/projects/roles/update", async (request, reply) => {
    const result = await roleService.updateRole(request.body);
    return reply
      .code(
        result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
      )
      .send(result);
  });

  app.get<{ Querystring: { readonly projectKey?: unknown } }>(
    "/api/projects/issues",
    async (request, reply) => {
      const projectKey = request.query?.projectKey;
      if (typeof projectKey !== "string")
        return reply.code(400).send({
          ok: false,
          error: {
            code: "invalid_input",
            message: "A project key is required.",
            details: [],
          },
        });
      const result = await issueService.getIssues(projectKey);
      return reply
        .code(
          result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
        )
        .send(result);
    },
  );

  app.post("/api/projects/issues", async (request, reply) => {
    const result = await issueService.create(request.body);
    return reply
      .code(
        result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
      )
      .send(result);
  });
  app.post("/api/projects/issues/discussion", async (request, reply) => {
    const result = await issueService.discuss(request.body);
    return reply
      .code(
        result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
      )
      .send(result);
  });
  app.post("/api/projects/issues/decision", async (request, reply) => {
    const result = await issueService.decide(request.body);
    return reply
      .code(
        result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
      )
      .send(result);
  });
  app.post("/api/projects/issues/recover", async (request, reply) => {
    const result = await issueService.recover(request.body);
    return reply
      .code(
        result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
      )
      .send(result);
  });

  app.get<{
    Querystring: {
      readonly projectKey?: unknown;
      readonly once?: unknown;
      readonly lastEventId?: unknown;
    };
  }>("/api/projects/events", async (request, reply) => {
    const projectKey = request.query?.projectKey;
    if (typeof projectKey !== "string") {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "invalid_input",
          message: "A project key is required.",
          details: [],
        },
      });
    }
    const lastEventId =
      typeof request.headers["last-event-id"] === "string"
        ? request.headers["last-event-id"]
        : typeof request.query?.lastEventId === "string"
          ? request.query.lastEventId
          : null;
    const replay = await reportService.replay(projectKey, lastEventId);
    if (!replay.ok) return reply.code(400).send(replay);
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    const write = (event: (typeof replay.value)[number]): void => {
      reply.raw.write(
        `id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event.payload)}\n\n`,
      );
    };
    for (const event of replay.value) write(event);
    const once = request.query?.once === "true";
    if (once) {
      reply.raw.end();
      return;
    }
    const unsubscribe = reportService.hub.subscribe(projectKey, write);
    request.raw.on("close", unsubscribe);
    reply.raw.write(": connected\n\n");
  });

  app.get<{ Querystring: { readonly projectKey?: unknown } }>(
    "/api/projects/reports",
    async (request, reply) => {
      const projectKey = request.query?.projectKey;
      if (typeof projectKey !== "string")
        return reply.code(400).send({
          ok: false,
          error: {
            code: "invalid_input",
            message: "A project key is required.",
            details: [],
          },
        });
      const result = await reportService.getReports(projectKey);
      return reply
        .code(
          result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
        )
        .send(result);
    },
  );

  app.get<{ Querystring: { readonly projectKey?: unknown } }>(
    "/api/projects/settings",
    async (request, reply) => {
      const projectKey = request.query?.projectKey;
      if (typeof projectKey !== "string")
        return reply.code(400).send({
          ok: false,
          error: {
            code: "invalid_input",
            message: "A project key is required.",
            details: [],
          },
        });
      const result = settingsService.get(projectKey);
      return reply
        .code(
          result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
        )
        .send(result);
    },
  );
  app.post("/api/projects/settings", async (request, reply) => {
    const result = settingsService.update(request.body);
    return reply
      .code(
        result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
      )
      .send(result);
  });

  return app;
}
