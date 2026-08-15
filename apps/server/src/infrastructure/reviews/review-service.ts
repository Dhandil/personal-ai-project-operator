import type {
  AgentEvent,
  AgentOutput,
  AgentResult,
  AgentRuntime,
  AgentStartRequest,
  ExecutionId,
  FormalId,
  GoalId,
  TaskId,
  UtcIsoTimestamp,
} from "@personal-ai-operator/contracts";
import {
  parseFormalId,
  reviewerOutputSchema,
  type ReviewReport,
} from "@personal-ai-operator/contracts";

import { createAuditEvent } from "../audit/audit-event.js";
import { AuditLogRepository } from "../audit/audit-log-repository.js";
import { CodexCliAdapter } from "../agent-runtime/codex-cli-adapter.js";
import { GitChangeBoundaryService } from "../git/git-change-boundary.js";
import {
  TaskPackageService,
  type TaskPackage,
} from "../execution/task-package-service.js";
import type { TaskResultValidationReport } from "../execution/task-result-validation.js";
import {
  ReviewReportRepository,
  type ReviewReportRepositoryResult,
} from "./review-report-repository.js";
import {
  ProjectRegistryRepository,
  type ProjectIndexRecord,
} from "../registry/project-registry-repository.js";
import type { ProjectRegistryFactory } from "../projects/project-startup.js";

export type ReviewInput = Readonly<{
  readonly projectKey: string;
  readonly taskId: TaskId;
  readonly executionId: ExecutionId;
  readonly validation: TaskResultValidationReport;
}>;

export type ReviewErrorCode =
  | "invalid_input"
  | "project_not_found"
  | "task_not_found"
  | "goal_not_found"
  | "runtime_failed"
  | "review_output_invalid"
  | "boundary_failed"
  | "privilege_violation"
  | "audit_failed"
  | "report_write_failed";

export type ReviewError = Readonly<{
  readonly code: ReviewErrorCode;
  readonly message: string;
  readonly details: readonly string[];
}>;

export type ReviewResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: ReviewError }>;

export type ReviewServiceOptions = Readonly<{
  readonly runtime?: AgentRuntime;
  readonly taskPackageService?: TaskPackageService;
  readonly reportRepository?: ReviewReportRepository;
  readonly boundary?: GitChangeBoundaryService;
  readonly registryFactory?: ProjectRegistryFactory;
  readonly now?: () => UtcIsoTimestamp;
}>;

type ReviewerOutput = ReturnType<typeof reviewerOutputSchema.parse>;

function failure<Value>(
  code: ReviewErrorCode,
  message: string,
  details: readonly string[] = [],
): ReviewResult<Value> {
  return { ok: false, error: { code, message, details } };
}

function timestamp(): UtcIsoTimestamp {
  return new Date().toISOString() as UtcIsoTimestamp;
}

function jsonArray(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return value;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed;
  } catch {
    return value;
  }
}

function normalizeReviewerOutput(output: AgentOutput | null): unknown {
  if (output === null) return null;
  return {
    schemaVersion: output.schemaVersion,
    kind: output.kind,
    taskId: output.taskId,
    decision: output.decision,
    findings: jsonArray(output.findings),
    verificationEvidence: jsonArray(output.verificationEvidence),
    requiredChanges: jsonArray(output.requiredChanges),
    handoff: output.handoff,
  };
}

function validationDetails(
  validation: TaskResultValidationReport,
): readonly string[] {
  return [
    ...validation.reasons,
    ...validation.evidence.details,
    ...validation.boundary.violations.map((item) => item.message),
  ];
}

function reviewerRequest(
  packageValue: TaskPackage,
  validation: TaskResultValidationReport,
): AgentStartRequest {
  const reviewContext = JSON.stringify({
    taskId: packageValue.taskId,
    executionId: validation.executionId,
    passed: validation.passed,
    diff: validation.boundary,
    files: validation.artifacts,
    tests: validation.verification,
    evidence: validation.evidence,
    reasons: validation.reasons,
  });
  return {
    taskId: parseFormalId(packageValue.taskId) as TaskId,
    goalId: parseFormalId(packageValue.goalId) as GoalId,
    role: "reviewer",
    prompt: [
      `Review execution ${validation.executionId} for task ${packageValue.taskId}.`,
      "You are a read-only reviewer. Do not modify, create, delete, or overwrite project files.",
      "Return reviewer_result_v1 with decision, findings, verificationEvidence, requiredChanges, and handoff.",
      `Execution evidence: ${reviewContext}`,
    ].join("\n"),
    workingDirectory: packageValue.paths.workingDirectory,
    allowedPaths: packageValue.paths.allowed,
    forbiddenPaths: packageValue.paths.forbidden,
    context: [
      { key: "review_task_package", value: JSON.stringify(packageValue) },
      { key: "execution_validation", value: reviewContext },
    ],
  };
}

function eventHasPrivilegeViolation(events: readonly AgentEvent[]): boolean {
  return events.some((event) => event.type === "privilege_violation");
}

function reportFrom(
  id: ReviewReport["id"],
  projectKey: string,
  packageValue: TaskPackage,
  executionId: ExecutionId,
  reviewerExecutionId: ExecutionId,
  output: ReviewerOutput,
  validation: TaskResultValidationReport,
  now: UtcIsoTimestamp,
): ReviewReport {
  return {
    schemaVersion: 1,
    documentType: "review_report",
    kind: "review_report",
    id,
    revision: 1,
    projectKey,
    taskId: parseFormalId(packageValue.taskId) as TaskId,
    goalId: parseFormalId(packageValue.goalId) as GoalId,
    executionId,
    reviewerExecutionId,
    decision: output.decision,
    readOnly: true,
    sandbox: "read-only",
    createdAt: now,
    updatedAt: now,
    diff: {
      passed: validation.boundary.passed,
      changes: validation.boundary.changes.map((change) => ({ ...change })),
      violations: validation.boundary.violations.map((violation) => ({
        ...violation,
      })),
      beforeHead: validation.boundary.beforeHead,
      afterHead: validation.boundary.afterHead,
      beforeBranch: validation.boundary.beforeBranch,
      afterBranch: validation.boundary.afterBranch,
    },
    files: validation.artifacts.map((artifact) => ({ ...artifact })),
    tests: validation.verification.map((test) => ({ ...test })),
    evidence: {
      required: [...validation.evidence.required],
      verified: validation.evidence.verified,
      details: [...validation.evidence.details],
    },
    findings: output.findings.map((finding) => ({ ...finding })),
    verificationEvidence: [...output.verificationEvidence],
    requiredChanges: [
      ...output.requiredChanges,
      ...(validation.passed ? [] : validationDetails(validation)),
    ],
    handoff: output.handoff,
    reviewerDiagnostics: [],
    auditEventIds: [],
  };
}

export class ReviewService {
  private readonly runtime: AgentRuntime;
  private readonly taskPackageService: TaskPackageService;
  private readonly reportRepository: ReviewReportRepository;
  private readonly boundary: GitChangeBoundaryService;
  private readonly registryFactory: ProjectRegistryFactory;
  private readonly now: () => UtcIsoTimestamp;

  public constructor(options: ReviewServiceOptions = {}) {
    this.runtime = options.runtime ?? new CodexCliAdapter();
    this.taskPackageService =
      options.taskPackageService ?? new TaskPackageService();
    this.reportRepository =
      options.reportRepository ?? new ReviewReportRepository();
    this.boundary = options.boundary ?? new GitChangeBoundaryService();
    this.registryFactory =
      options.registryFactory ?? (() => new ProjectRegistryRepository());
    this.now = options.now ?? timestamp;
  }

  public async get(
    projectKey: string,
    reportId: string,
  ): Promise<ReviewResult<ReviewReport>> {
    const project = await this.findProject(projectKey);
    if (!project.ok) return project;
    const report = await this.reportRepository.read(
      project.value.rootPath,
      reportId,
    );
    if (!report.ok) {
      return failure(
        report.error.code === "not_found"
          ? "project_not_found"
          : "report_write_failed",
        report.error.message,
        report.error.details,
      );
    }
    return { ok: true, value: report.value };
  }

  public async review(input: ReviewInput): Promise<ReviewResult<ReviewReport>> {
    if (
      input.projectKey.trim().length === 0 ||
      input.validation.taskId !== input.taskId ||
      input.validation.executionId !== input.executionId
    ) {
      return failure(
        "invalid_input",
        "Review input must identify the same task and execution as the validation report.",
      );
    }

    const packageResult = await this.taskPackageService.build({
      projectKey: input.projectKey,
      taskId: input.taskId,
      role: "reviewer",
    });
    if (!packageResult.ok) {
      const errorCode: ReviewErrorCode =
        packageResult.error.code === "project_not_found"
          ? "project_not_found"
          : packageResult.error.code === "task_not_found"
            ? "task_not_found"
            : packageResult.error.code === "goal_not_found" ||
                packageResult.error.code === "role_not_found"
              ? "goal_not_found"
              : packageResult.error.code === "invalid_input" ||
                  packageResult.error.code === "unsupported_role"
                ? "invalid_input"
                : "runtime_failed";
      return failure(
        errorCode,
        packageResult.error.message,
        packageResult.error.details,
      );
    }
    const packageValue = packageResult.value;
    if (
      packageValue.permissions.mode !== "read_only" ||
      packageValue.permissions.canModifyProjectFiles
    ) {
      return failure(
        "invalid_input",
        "Reviewer package is not read-only; refusing to start review.",
      );
    }

    const before = await this.boundary.capture(packageValue.projectRoot);
    if (!before.ok) {
      return failure(
        "boundary_failed",
        before.error.message,
        before.error.details,
      );
    }

    let session: Awaited<ReturnType<AgentRuntime["start"]>>;
    try {
      session = await this.runtime.start(
        reviewerRequest(packageValue, input.validation),
      );
    } catch (error) {
      return failure("runtime_failed", "The reviewer Agent could not start.", [
        error instanceof Error ? error.message : String(error),
      ]);
    }

    const events: AgentEvent[] = [];
    for await (const event of session.events) events.push(event);
    let result: AgentResult;
    try {
      result = await session.result;
    } catch (error) {
      return failure("runtime_failed", "The reviewer Agent result failed.", [
        error instanceof Error ? error.message : String(error),
      ]);
    }

    const after = await this.boundary.validate(
      before.value,
      { allowedPaths: [], forbiddenPaths: ["."] },
      [],
    );
    if (!after.ok) {
      return failure(
        "boundary_failed",
        after.error.message,
        after.error.details,
      );
    }

    const blocked =
      eventHasPrivilegeViolation(events) ||
      result.status === "privilege_violation" ||
      !after.value.passed;
    if (blocked) {
      const audit = await this.recordPrivilegeViolation(
        packageValue.projectRoot,
        input.taskId,
        input.executionId,
        session.executionId,
        after.value.violations.map((item) => item.message),
      );
      if (!audit.ok) return audit;
      return failure(
        "privilege_violation",
        "The read-only reviewer attempted a forbidden write or reported a privilege violation; no review report was saved.",
        [
          ...after.value.violations.map((item) => item.message),
          ...result.diagnostics,
        ],
      );
    }

    if (result.status !== "completed") {
      return failure(
        "runtime_failed",
        "The reviewer did not produce a completed result.",
        result.diagnostics,
      );
    }
    const parsed = reviewerOutputSchema.safeParse(
      normalizeReviewerOutput(result.output),
    );
    if (!parsed.success) {
      return failure(
        "review_output_invalid",
        "The reviewer output does not satisfy reviewer_result_v1.",
        parsed.error.issues.map(
          (issue) => `${issue.path.join(".") || "output"}: ${issue.message}`,
        ),
      );
    }
    if (parsed.data.taskId !== input.taskId) {
      return failure(
        "review_output_invalid",
        "The reviewer output taskId does not match the reviewed task.",
      );
    }
    if (!input.validation.passed && parsed.data.decision === "accepted") {
      return failure(
        "review_output_invalid",
        "A failed execution validation cannot receive an accepted review decision.",
        validationDetails(input.validation),
      );
    }

    const nextId = await this.reportRepository.nextId(packageValue.projectRoot);
    if (!nextId.ok) {
      return failure(
        "report_write_failed",
        nextId.error.message,
        nextId.error.details,
      );
    }
    const report = reportFrom(
      nextId.value,
      input.projectKey,
      packageValue,
      input.executionId,
      session.executionId,
      parsed.data,
      input.validation,
      this.now(),
    );
    const saved: ReviewReportRepositoryResult<ReviewReport> =
      await this.reportRepository.save(packageValue.projectRoot, report);
    if (!saved.ok) {
      return failure(
        "report_write_failed",
        saved.error.message,
        saved.error.details,
      );
    }
    return { ok: true, value: saved.value };
  }

  private async recordPrivilegeViolation(
    projectRoot: string,
    taskId: TaskId,
    executionId: ExecutionId,
    reviewerExecutionId: ExecutionId,
    violations: readonly string[],
  ): Promise<ReviewResult<never>> {
    const repository = new AuditLogRepository(projectRoot);
    const existing = await repository.readAll();
    if (!existing.ok) {
      return failure(
        "audit_failed",
        existing.error.message,
        existing.error.details,
      );
    }
    const nextNumber =
      existing.value.reduce(
        (max, event) => Math.max(max, Number(event.id.slice(5))),
        0,
      ) + 1;
    const auditEventId = parseFormalId(
      `EXEC-${String(nextNumber).padStart(3, "0")}`,
    ) as ExecutionId;
    const created = createAuditEvent({
      id: auditEventId,
      occurredAt: this.now(),
      type: "privilege_violation",
      actor: "reviewer",
      action: "read-only reviewer write attempt blocked",
      relatedObjectIds: [
        taskId,
        executionId,
        reviewerExecutionId,
      ] as FormalId[],
      executionId: reviewerExecutionId,
      details: {
        audit_event_id: auditEventId,
        reviewer_execution_id: reviewerExecutionId,
        violation_count: violations.length,
        violations: violations.join(" | ") || "reported by reviewer runtime",
      },
    });
    if (!created.ok) {
      return failure(
        "audit_failed",
        created.error.message,
        created.error.details,
      );
    }
    const appended = await repository.append(created.value);
    if (!appended.ok) {
      return failure(
        "audit_failed",
        appended.error.message,
        appended.error.details,
      );
    }
    return failure(
      "privilege_violation",
      "Read-only reviewer write attempt blocked.",
    );
  }

  private async findProject(
    projectKey: string,
  ): Promise<ReviewResult<ProjectIndexRecord>> {
    let registry: ProjectRegistryRepository;
    try {
      registry = this.registryFactory();
    } catch (error) {
      return failure(
        "runtime_failed",
        "Project registry could not be opened.",
        [error instanceof Error ? error.message : String(error)],
      );
    }
    try {
      const listed = registry.list();
      if (!listed.ok) {
        return failure(
          "runtime_failed",
          listed.error.message,
          listed.error.details,
        );
      }
      const project = listed.value.find(
        (item) => item.projectKey === projectKey && !item.archived,
      );
      return project === undefined
        ? failure("project_not_found", "Project is not registered or archived.")
        : { ok: true, value: project };
    } finally {
      registry.close();
    }
  }
}
