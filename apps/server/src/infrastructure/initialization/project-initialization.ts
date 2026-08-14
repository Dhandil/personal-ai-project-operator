import {
  parseFormalId,
  parseUtcIsoTimestamp,
  type ExecutionId,
  type UtcIsoTimestamp,
} from "@personal-ai-operator/contracts";
import { createDefaultWorkflow } from "@personal-ai-operator/domain";

import { createAuditEvent, type AuditEvent } from "../audit/audit-event.js";
import { AuditLogRepository } from "../audit/audit-log-repository.js";
import {
  GitBootstrapService,
  type GitBootstrapApproval,
  type GitBootstrapOutcome,
} from "../git/git-bootstrap.js";
import { GovernanceRepository } from "../files/governance-repository.js";
import type { GovernanceDocument } from "../files/governance-codec.js";
import {
  ProjectRegistryRepository,
  type ProjectIndexRecord,
} from "../registry/project-registry-repository.js";
import {
  ProjectInitializationPreviewService,
  type ProjectInitializationPreview,
  type ProjectInitializationPreviewInput,
} from "./project-init-preview.js";

export type ProjectInitializationApproval = Readonly<{
  readonly approved: boolean;
  readonly approvalId: string;
}>;

export type ProjectInitializationRequest = Readonly<{
  readonly preview: ProjectInitializationPreview;
  readonly approval: ProjectInitializationApproval;
}>;

export type ProjectInitializationRecovery = Readonly<{
  readonly createdFiles: readonly string[];
  readonly registryRegistered: boolean;
  readonly gitState: "not_started" | "partially_initialized" | "completed";
  readonly nextStep: "re_preview_and_retry" | "inspect_and_retry" | "none";
}>;

export type ProjectInitializationExecution = Readonly<{
  readonly projectRoot: string;
  readonly projectKey: string;
  readonly project: ProjectIndexRecord;
  readonly filesCreated: readonly string[];
  readonly git: GitBootstrapOutcome;
  readonly approvalId: string;
  readonly auditEventId: ExecutionId;
  readonly recovery: ProjectInitializationRecovery;
}>;

export type ProjectInitializationErrorCode =
  | "invalid_input"
  | "not_approved"
  | "invalid_approval"
  | "preview_stale"
  | "conflicts_present"
  | "invalid_git_state"
  | "write_failed"
  | "registry_failed"
  | "audit_failed"
  | "git_failed";

export type ProjectInitializationError = Readonly<{
  readonly code: ProjectInitializationErrorCode;
  readonly message: string;
  readonly details: readonly string[];
  readonly recovery: ProjectInitializationRecovery;
}>;

export type ProjectInitializationResult =
  | Readonly<{
      readonly ok: true;
      readonly value: ProjectInitializationExecution;
    }>
  | Readonly<{
      readonly ok: false;
      readonly error: ProjectInitializationError;
    }>;

export type ProjectInitializationServiceOptions = Readonly<{
  readonly previewService?: ProjectInitializationPreviewService;
  readonly gitBootstrap?: GitBootstrapService;
  readonly registryFactory?: () => ProjectRegistryRepository;
  readonly now?: () => UtcIsoTimestamp;
}>;

function currentTimestamp(): UtcIsoTimestamp {
  return parseUtcIsoTimestamp(new Date().toISOString());
}

function emptyRecovery(): ProjectInitializationRecovery {
  return {
    createdFiles: [],
    registryRegistered: false,
    gitState: "not_started",
    nextStep: "re_preview_and_retry",
  };
}

function failure(
  code: ProjectInitializationErrorCode,
  message: string,
  details: readonly string[] = [],
  recovery: ProjectInitializationRecovery = emptyRecovery(),
): ProjectInitializationResult {
  return { ok: false, error: { code, message, details, recovery } };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .toSorted()
      .map((key) => [key, stableValue(record[key])]),
  );
}

function previewFingerprint(preview: ProjectInitializationPreview): string {
  return JSON.stringify(stableValue(preview));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPreview(value: unknown): value is ProjectInitializationPreview {
  return isRecord(value) && typeof value.projectRoot === "string";
}

function isApproval(value: unknown): value is ProjectInitializationApproval {
  return (
    isRecord(value) &&
    typeof value.approved === "boolean" &&
    typeof value.approvalId === "string"
  );
}

function document(
  frontMatter: Readonly<Record<string, unknown>>,
  body: string,
): GovernanceDocument {
  return { frontMatter, body };
}

function baseFrontMatter(
  documentType: string,
  timestamp: UtcIsoTimestamp,
): Readonly<Record<string, unknown>> {
  return {
    schema_version: 1,
    document_type: documentType,
    revision: 1,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function stageForPath(
  relativePath: string,
  preview: ProjectInitializationPreview,
) {
  const stageNumber = Number(relativePath.split("/")[3]?.split("-")[0]);
  return preview.defaultWorkflow.find((stage) => stage.order === stageNumber);
}

function documentForPath(
  relativePath: string,
  preview: ProjectInitializationPreview,
  timestamp: UtcIsoTimestamp,
): GovernanceDocument | null {
  if (relativePath.endsWith("events.jsonl")) {
    return null;
  }

  if (relativePath === ".personal-workspace/project.md") {
    return document(
      {
        ...baseFrontMatter("project", timestamp),
        name: preview.projectName,
        idea: preview.idea,
        default_settings: preview.defaultSettings,
      },
      `# ${preview.projectName}\n\n${preview.idea}\n`,
    );
  }

  if (relativePath === ".personal-workspace/workflow.md") {
    const workflow = createDefaultWorkflow();
    return document(
      {
        ...baseFrontMatter("workflow", timestamp),
        current_stage: workflow.currentStage,
        stages: preview.defaultWorkflow,
        roles: preview.defaultRoles,
      },
      "# Default workflow\n",
    );
  }

  if (relativePath === ".personal-workspace/status.md") {
    return document(
      {
        ...baseFrontMatter("status_snapshot", timestamp),
        status: "draft",
        source: "project_initialization",
      },
      "# Project status\n\nProject initialization is complete.\n",
    );
  }

  if (relativePath.includes("/stages/")) {
    const stage = stageForPath(relativePath, preview);
    if (stage === undefined) {
      return null;
    }
    return document(
      {
        ...baseFrontMatter("stage", timestamp),
        stage_key: stage.key,
        title: stage.title,
        order: stage.order,
        status: stage.status,
      },
      `# ${stage.title}\n`,
    );
  }

  const collection = relativePath
    .replace(".personal-workspace/", "")
    .replace("/README.md", "");
  return document(
    {
      ...baseFrontMatter("collection", timestamp),
      collection,
    },
    `# ${collection}\n\nThis directory stores project governance records.\n`,
  );
}

function nextExecutionId(events: readonly AuditEvent[]): ExecutionId {
  const next =
    events.reduce((maximum, event) => {
      const value = Number(event.id.slice("EXEC-".length));
      return Number.isInteger(value) && value > maximum ? value : maximum;
    }, 0) + 1;
  if (next > 999) {
    throw new Error("No execution ID is available for initialization audit.");
  }
  return parseFormalId(`EXEC-${String(next).padStart(3, "0")}`) as ExecutionId;
}

async function appendInitializationAudit(
  audit: AuditLogRepository,
  preview: ProjectInitializationPreview,
  projectKey: string,
  approvalId: string,
  timestamp: UtcIsoTimestamp,
): Promise<
  | Readonly<{ readonly event: AuditEvent }>
  | Readonly<{ readonly error: string }>
> {
  const events = await audit.readAll();
  if (!events.ok) {
    return { error: events.error.message };
  }

  let id: ExecutionId;
  try {
    id = nextExecutionId(events.value);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  const created = createAuditEvent({
    id,
    occurredAt: timestamp,
    type: "status_changed",
    actor: "system",
    action: "project_initialization_approved",
    relatedObjectIds: [],
    executionId: id,
    statusChange: {
      from: null,
      to: "draft",
      reason:
        "Approved project initialization completed its governed write plan.",
    },
    details: {
      approval_id: approvalId,
      project_key: projectKey,
      git_action: preview.git.planned.action,
      git_commands: preview.git.planned.commands.join(" | "),
      git_remote_operations: "none",
    },
  });
  if (!created.ok) {
    return { error: created.error.message };
  }

  const appended = await audit.append(created.value);
  return appended.ok
    ? { event: appended.value }
    : { error: appended.error.message };
}

async function appendFailureAudit(
  audit: AuditLogRepository,
  executionId: ExecutionId,
  message: string,
  timestamp: UtcIsoTimestamp,
): Promise<string | null> {
  const events = await audit.readAll();
  if (!events.ok) {
    return events.error.message;
  }
  let id: ExecutionId;
  try {
    id = nextExecutionId(events.value);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  const created = createAuditEvent({
    id,
    occurredAt: timestamp,
    type: "failure",
    actor: "system",
    action: "project_initialization_failed",
    relatedObjectIds: [],
    executionId,
    details: { error: message },
  });
  if (!created.ok) {
    return created.error.message;
  }
  const appended = await audit.append(created.value);
  return appended.ok ? null : appended.error.message;
}

export class ProjectInitializationService {
  private readonly previewService: ProjectInitializationPreviewService;
  private readonly gitBootstrap: GitBootstrapService;
  private readonly registryFactory: () => ProjectRegistryRepository;
  private readonly now: () => UtcIsoTimestamp;

  public constructor(options: ProjectInitializationServiceOptions = {}) {
    this.previewService =
      options.previewService ?? new ProjectInitializationPreviewService();
    this.gitBootstrap = options.gitBootstrap ?? new GitBootstrapService();
    this.registryFactory =
      options.registryFactory ?? (() => new ProjectRegistryRepository());
    this.now = options.now ?? currentTimestamp;
  }

  public async execute(input: unknown): Promise<ProjectInitializationResult> {
    if (
      !isRecord(input) ||
      !isPreview(input.preview) ||
      !isApproval(input.approval)
    ) {
      return failure(
        "invalid_input",
        "Initialization requires a preview and an approval decision.",
      );
    }

    const preview = input.preview;
    const approval = input.approval;
    if (approval.approvalId.trim().length === 0) {
      return failure("invalid_approval", "Approval ID cannot be empty.");
    }
    if (!approval.approved) {
      return failure(
        "not_approved",
        "Project initialization requires explicit user approval.",
      );
    }

    const currentPreview = await this.previewService.preview({
      projectRoot: preview.projectRoot,
      projectName: preview.projectName,
      idea: preview.idea,
    } satisfies ProjectInitializationPreviewInput);
    if (!currentPreview.ok) {
      return failure(
        "preview_stale",
        "The original preview is no longer valid; create a new preview.",
        [currentPreview.error.message, ...currentPreview.error.details],
      );
    }
    if (
      previewFingerprint(preview) !== previewFingerprint(currentPreview.value)
    ) {
      return failure(
        "preview_stale",
        "The project directory or Git state changed after the preview; create a new preview.",
      );
    }
    if (preview.conflicts.length > 0) {
      return failure(
        "conflicts_present",
        "Initialization cannot overwrite files reported as preview conflicts.",
        preview.conflicts.map((conflict) => conflict.relativePath),
      );
    }
    if (preview.git.detected.state === "invalid_repository") {
      return failure(
        "invalid_git_state",
        "Initialization cannot replace or repair an invalid Git repository.",
        preview.git.detected.details,
      );
    }

    const timestamp = this.now();
    const governance = new GovernanceRepository(preview.projectRoot);
    const createdFiles: string[] = [];
    for (const planned of preview.plannedFiles) {
      if (planned.action !== "create") {
        continue;
      }
      const content = documentForPath(planned.relativePath, preview, timestamp);
      if (content === null) {
        continue;
      }
      const written = await governance.write(
        planned.relativePath,
        content,
        null,
      );
      if (!written.ok) {
        return failure(
          "write_failed",
          "Project governance files could not be created without overwriting existing content.",
          [
            planned.relativePath,
            written.error.message,
            ...written.error.details,
          ],
          {
            createdFiles,
            registryRegistered: false,
            gitState: "not_started",
            nextStep: "inspect_and_retry",
          },
        );
      }
      createdFiles.push(planned.relativePath);
    }

    let registry: ProjectRegistryRepository;
    try {
      registry = this.registryFactory();
    } catch (error) {
      return failure(
        "registry_failed",
        "Project files were created, but the project registry could not be opened.",
        [error instanceof Error ? error.message : String(error)],
        {
          createdFiles,
          registryRegistered: false,
          gitState: "not_started",
          nextStep: "inspect_and_retry",
        },
      );
    }

    let registered: ProjectIndexRecord;
    try {
      const registration = await registry.register({
        rootPath: preview.projectRoot,
        name: preview.projectName,
        registeredAt: timestamp,
      });
      if (!registration.ok) {
        return failure(
          "registry_failed",
          "Project files were created, but registry registration failed.",
          [registration.error.message, ...registration.error.details],
          {
            createdFiles,
            registryRegistered: false,
            gitState: "not_started",
            nextStep: "inspect_and_retry",
          },
        );
      }
      registered = registration.value;

      const audit = new AuditLogRepository(preview.projectRoot);
      const initialAudit = await appendInitializationAudit(
        audit,
        preview,
        registered.projectKey,
        approval.approvalId,
        timestamp,
      );
      if ("error" in initialAudit) {
        return failure(
          "audit_failed",
          "Project files and registry were created, but initialization could not be audited before Git execution.",
          [initialAudit.error],
          {
            createdFiles,
            registryRegistered: true,
            gitState: "not_started",
            nextStep: "inspect_and_retry",
          },
        );
      }
      createdFiles.push(".personal-workspace/audit/events.jsonl");

      const gitApproval: GitBootstrapApproval = {
        approved: true,
        approvalId: approval.approvalId,
      };
      const bootstrapped = await this.gitBootstrap.bootstrap({
        projectRoot: preview.projectRoot,
        approval: gitApproval,
      });
      if (!bootstrapped.ok) {
        const auditError = await appendFailureAudit(
          audit,
          initialAudit.event.id,
          bootstrapped.error.message,
          this.now(),
        );
        return failure(
          "git_failed",
          "Project files and registry were created, but the Git baseline failed.",
          [
            bootstrapped.error.message,
            ...bootstrapped.error.details,
            ...(auditError === null ? [] : [`Audit failure: ${auditError}`]),
          ],
          {
            createdFiles,
            registryRegistered: true,
            gitState: "partially_initialized",
            nextStep: "inspect_and_retry",
          },
        );
      }

      let git = bootstrapped.value;
      if (git.kind === "already_initialized") {
        const baseline = await this.gitBootstrap.commitBaseline(
          preview.projectRoot,
          gitApproval,
        );
        if (!baseline.ok) {
          const auditError = await appendFailureAudit(
            audit,
            initialAudit.event.id,
            baseline.error.message,
            this.now(),
          );
          return failure(
            "git_failed",
            "Project files and registry were created, but the Git baseline failed.",
            [
              baseline.error.message,
              ...baseline.error.details,
              ...(auditError === null ? [] : [`Audit failure: ${auditError}`]),
            ],
            {
              createdFiles,
              registryRegistered: true,
              gitState: "partially_initialized",
              nextStep: "inspect_and_retry",
            },
          );
        }
        git = {
          ...git,
          commit:
            baseline.value.kind === "committed" ? baseline.value.commit : null,
        };
      }

      return {
        ok: true,
        value: {
          projectRoot: preview.projectRoot,
          projectKey: registered.projectKey,
          project: registered,
          filesCreated: createdFiles,
          git,
          approvalId: approval.approvalId,
          auditEventId: initialAudit.event.id,
          recovery: {
            createdFiles,
            registryRegistered: true,
            gitState: "completed",
            nextStep: "none",
          },
        },
      };
    } finally {
      registry.close();
    }
  }
}
