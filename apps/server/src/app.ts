import Fastify, { type FastifyInstance } from "fastify";
import type { ReportId, TaskId } from "@personal-ai-operator/contracts";

import {
  ProjectInitializationPreviewService,
  type ProjectInitializationPreviewInput,
} from "./infrastructure/initialization/project-init-preview.js";
import { ProjectInitializationService } from "./infrastructure/initialization/project-initialization.js";
import {
  isLoopbackAddress,
  LocalDirectoryPickerService,
} from "./infrastructure/initialization/local-directory-picker.js";
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
import { TaskService } from "./infrastructure/tasks/task-service.js";
import { ApprovalService } from "./infrastructure/approvals/approval-service.js";
import { RecoveryService } from "./infrastructure/recovery/recovery-service.js";
import { ExecutionCoordinatorService } from "./infrastructure/execution/execution-coordinator.js";
import { TaskPackageService } from "./infrastructure/execution/task-package-service.js";
import { CodexCliPreflightService } from "./infrastructure/agent-runtime/codex-cli-preflight.js";
import {
  ReviewService,
  type ReviewInput,
} from "./infrastructure/reviews/review-service.js";
import {
  ReviewLoopService,
  type ReworkInput,
} from "./infrastructure/reviews/review-loop-service.js";
import { PlanningDraftService } from "./infrastructure/planning/planning-draft-service.js";
import {
  StageCoordinatorService,
  type StageCoordinatorDecisionInput,
  type StageCoordinatorStartInput,
  type StageCoordinatorControlInput,
} from "./infrastructure/stages/stage-coordinator.js";

const SERVICE_NAME = "@personal-ai-operator/server";

export type HealthResponse = Readonly<{
  readonly status: "ok";
  readonly service: typeof SERVICE_NAME;
}>;

export type AppOptions = Readonly<{
  readonly projectInitializationService?: ProjectInitializationService;
  readonly localDirectoryPickerService?: LocalDirectoryPickerService;
  readonly projectQueryService?: ProjectQueryService;
  readonly projectStartupService?: ProjectStartupService;
  readonly workflowService?: WorkflowService;
  readonly goalService?: GoalService;
  readonly roleService?: RoleService;
  readonly issueService?: IssueService;
  readonly reportService?: ReportService;
  readonly settingsService?: SettingsService;
  readonly taskService?: TaskService;
  readonly approvalService?: ApprovalService;
  readonly recoveryService?: RecoveryService;
  readonly executionCoordinatorService?: ExecutionCoordinatorService;
  readonly taskPackageService?: TaskPackageService;
  readonly codexCliPreflightService?: CodexCliPreflightService;
  readonly reviewService?: ReviewService;
  readonly reviewLoopService?: ReviewLoopService;
  readonly planningDraftService?: PlanningDraftService;
  readonly stageCoordinatorService?: StageCoordinatorService;
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

  const localDirectoryPickerService =
    options.localDirectoryPickerService ?? new LocalDirectoryPickerService();
  app.post("/api/projects/select-directory", async (request, reply) => {
    const remoteAddress = request.raw.socket.remoteAddress ?? request.ip;
    if (!isLoopbackAddress(remoteAddress)) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: "local_only",
          message: "本机目录选择器只接受本机用户请求。",
          details: [],
        },
      });
    }
    const result = await localDirectoryPickerService.select();
    return reply.code(result.ok ? 200 : 400).send(result);
  });

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
  const taskService = options.taskService ?? new TaskService();
  const approvalService = options.approvalService ?? new ApprovalService();
  const recoveryService = options.recoveryService ?? new RecoveryService();
  const executionCoordinatorService =
    options.executionCoordinatorService ??
    new ExecutionCoordinatorService({
      taskService,
      goalService,
      issueService,
    });
  const taskPackageService =
    options.taskPackageService ??
    new TaskPackageService({ taskService, goalService, roleService });
  const codexCliPreflightService =
    options.codexCliPreflightService ?? new CodexCliPreflightService();
  const reviewService = options.reviewService ?? new ReviewService();
  const reviewLoopService =
    options.reviewLoopService ??
    new ReviewLoopService({
      reviewService,
      taskService,
      goalService,
      issueService,
      approvalService,
      executionCoordinator: executionCoordinatorService,
    });
  const planningDraftService =
    options.planningDraftService ?? new PlanningDraftService();
  const stageCoordinatorService =
    options.stageCoordinatorService ?? new StageCoordinatorService();

  app.addHook("onClose", async () => {
    await executionCoordinatorService.shutdown();
  });

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

  app.get<{ Querystring: { readonly projectKey?: unknown } }>(
    "/api/projects/planning-draft",
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
      const result = await planningDraftService.get({ projectKey });
      return reply
        .code(
          result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
        )
        .send(result);
    },
  );

  app.post("/api/projects/planning-draft/generate", async (request, reply) => {
    const result = await planningDraftService.generate(request.body);
    return reply
      .code(
        result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
      )
      .send(result);
  });

  app.post("/api/projects/planning-draft/edit", async (request, reply) => {
    const result = await planningDraftService.edit(request.body);
    return reply
      .code(
        result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
      )
      .send(result);
  });

  app.post("/api/projects/planning-draft/reject", async (request, reply) => {
    const result = await planningDraftService.reject(request.body);
    return reply
      .code(
        result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
      )
      .send(result);
  });

  app.post("/api/projects/planning-draft/approve", async (request, reply) => {
    const result = await planningDraftService.approve(request.body);
    return reply
      .code(
        result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
      )
      .send(result);
  });

  app.get<{ Querystring: { readonly projectKey?: unknown } }>(
    "/api/projects/stages",
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
      const result = await stageCoordinatorService.state({ projectKey });
      return reply
        .code(
          result.ok
            ? 200
            : result.error.code === "project_not_found"
              ? 404
              : 400,
        )
        .send(result);
    },
  );

  app.post("/api/projects/stages/start", async (request, reply) => {
    const result = await stageCoordinatorService.start(
      request.body as StageCoordinatorStartInput,
    );
    return reply
      .code(
        result.ok ? 200 : result.error.code === "project_not_found" ? 404 : 400,
      )
      .send(result);
  });

  app.post("/api/projects/stages/resume", async (request, reply) => {
    const result = await stageCoordinatorService.resume(
      request.body as StageCoordinatorControlInput,
    );
    return reply
      .code(
        result.ok ? 200 : result.error.code === "project_not_found" ? 404 : 400,
      )
      .send(result);
  });

  app.post("/api/projects/stages/retry", async (request, reply) => {
    const result = await stageCoordinatorService.retry(
      request.body as StageCoordinatorControlInput,
    );
    return reply
      .code(
        result.ok ? 200 : result.error.code === "project_not_found" ? 404 : 400,
      )
      .send(result);
  });

  app.post("/api/projects/stages/cancel", async (request, reply) => {
    const result = await stageCoordinatorService.cancel(
      request.body as StageCoordinatorControlInput,
    );
    return reply
      .code(
        result.ok ? 200 : result.error.code === "project_not_found" ? 404 : 400,
      )
      .send(result);
  });

  app.post("/api/projects/stages/decision", async (request, reply) => {
    const result = await stageCoordinatorService.decide(
      request.body as StageCoordinatorDecisionInput,
    );
    return reply
      .code(
        result.ok ? 200 : result.error.code === "project_not_found" ? 404 : 400,
      )
      .send(result);
  });

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
    "/api/projects/tasks",
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
      const result = await taskService.getTasks(projectKey);
      return reply
        .code(
          result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
        )
        .send(result);
    },
  );
  app.post("/api/projects/tasks", async (request, reply) => {
    const result = await taskService.create(request.body);
    return reply
      .code(
        result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
      )
      .send(result);
  });
  app.post("/api/projects/tasks/update", async (request, reply) => {
    const result = await taskService.update(request.body);
    return reply
      .code(
        result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
      )
      .send(result);
  });
  app.post("/api/projects/tasks/ready", async (request, reply) => {
    const result = await taskService.ready(request.body);
    return reply
      .code(
        result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
      )
      .send(result);
  });
  app.get<{
    Querystring: {
      readonly projectKey?: unknown;
      readonly taskId?: unknown;
      readonly role?: unknown;
    };
  }>("/api/projects/task-packages", async (request, reply) => {
    const projectKey = request.query?.projectKey;
    const taskId = request.query?.taskId;
    if (typeof projectKey !== "string" || typeof taskId !== "string") {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "invalid_input",
          message: "A project key and taskId are required.",
          details: [],
        },
      });
    }
    const result = await taskPackageService.build({
      projectKey,
      taskId,
      ...(typeof request.query?.role === "string"
        ? { role: request.query.role }
        : {}),
    });
    return reply
      .code(
        result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
      )
      .send(result);
  });

  app.post("/api/projects/review-loop", async (request, reply) => {
    const body = request.body as Record<string, unknown> | null;
    const operation = body?.operation;
    const result =
      operation === "review"
        ? await reviewLoopService.review(body as ReviewInput)
        : operation === "rework"
          ? await reviewLoopService.rework(body as ReworkInput)
          : operation === "advance"
            ? await reviewLoopService.advance(
                body as {
                  readonly projectKey: string;
                  readonly taskId: TaskId;
                  readonly reportId: ReportId;
                },
              )
            : {
                ok: false,
                error: {
                  code: "invalid_input",
                  message: "operation must be review, rework, or advance.",
                  details: [],
                },
              };
    return reply.code(result.ok ? 200 : 400).send(result);
  });
  app.post("/api/projects/task-packages", async (request, reply) => {
    const result = await taskPackageService.build(request.body);
    return reply
      .code(
        result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
      )
      .send(result);
  });

  app.post("/api/projects/reviews", async (request, reply) => {
    const result = await reviewService.review(request.body as ReviewInput);
    return reply
      .code(
        result.ok
          ? 200
          : result.error.code === "project_not_found"
            ? 404
            : result.error.code === "runtime_failed" ||
                result.error.code === "audit_failed"
              ? 500
              : 400,
      )
      .send(result);
  });

  app.get<{
    Querystring: {
      readonly projectKey?: unknown;
      readonly reportId?: unknown;
    };
  }>("/api/projects/reviews", async (request, reply) => {
    const projectKey = request.query?.projectKey;
    const reportId = request.query?.reportId;
    if (typeof projectKey !== "string" || typeof reportId !== "string") {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "invalid_input",
          message: "A project key and reportId are required.",
          details: [],
        },
      });
    }
    const result = await reviewService.get(projectKey, reportId);
    return reply
      .code(
        result.ok ? 200 : result.error.code === "project_not_found" ? 404 : 400,
      )
      .send(result);
  });

  app.get("/api/runtime/codex/preflight", async (_request, reply) => {
    const report = await codexCliPreflightService.check();
    return reply.code(200).send({ ok: true, value: report });
  });

  app.get<{ Querystring: { readonly projectKey?: unknown } }>(
    "/api/projects/approvals",
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
      const result = await approvalService.getApprovals(projectKey);
      return reply
        .code(
          result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
        )
        .send(result);
    },
  );
  app.post("/api/projects/approvals", async (request, reply) => {
    const result = await approvalService.request(request.body);
    return reply
      .code(
        result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
      )
      .send(result);
  });
  app.post("/api/projects/approvals/request", async (request, reply) => {
    const result = await approvalService.request(request.body);
    return reply
      .code(
        result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
      )
      .send(result);
  });
  app.post("/api/projects/approvals/decision", async (request, reply) => {
    const result = await approvalService.decide(request.body);
    return reply
      .code(
        result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
      )
      .send(result);
  });

  app.post("/api/projects/recovery", async (request, reply) => {
    const result = await recoveryService.recover(request.body);
    return reply
      .code(
        result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
      )
      .send(result);
  });
  app.post("/api/projects/rebuild", async (request, reply) => {
    const result = await recoveryService.recover(request.body);
    return reply
      .code(
        result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
      )
      .send(result);
  });
  app.get<{ Querystring: { readonly projectKey?: unknown } }>(
    "/api/projects/execution",
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
      const result = await executionCoordinatorService.getState(projectKey);
      return reply.code(result.ok ? 200 : 400).send(result);
    },
  );
  app.post("/api/projects/execution/start", async (request, reply) => {
    const result = await executionCoordinatorService.start(request.body);
    return reply.code(result.ok ? 200 : 400).send(result);
  });
  app.post("/api/projects/execution/resume", async (request, reply) => {
    const result = await executionCoordinatorService.resume(request.body);
    return reply.code(result.ok ? 200 : 400).send(result);
  });
  app.post("/api/projects/execution/cancel", async (request, reply) => {
    const result = await executionCoordinatorService.cancel(request.body);
    return reply.code(result.ok ? 200 : 400).send(result);
  });
  app.post("/api/projects/execution/retry", async (request, reply) => {
    const result = await executionCoordinatorService.retry(request.body);
    return reply.code(result.ok ? 200 : 400).send(result);
  });
  app.get<{ Querystring: { readonly projectKey?: unknown } }>(
    "/api/projects/history",
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
      const result = await recoveryService.history(projectKey);
      return reply
        .code(
          result.ok ? 200 : result.error.code === "registry_failed" ? 500 : 400,
        )
        .send(result);
    },
  );

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
