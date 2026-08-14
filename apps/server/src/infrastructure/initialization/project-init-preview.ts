import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import {
  createDefaultRoles,
  createDefaultWorkflow,
  type Role,
  type Stage,
} from "@personal-ai-operator/domain";

import {
  GitBootstrapService,
  type GitDetection,
  type GitBootstrapErrorCode,
  type GitRepositoryState,
} from "../git/git-bootstrap.js";
import { sha256Content } from "../files/content-hash.js";

export type ProjectInitializationPreviewInput = Readonly<{
  readonly projectRoot: string;
  readonly idea: string;
  readonly projectName?: string;
}>;

export type PlannedFile = Readonly<{
  readonly relativePath: string;
  readonly action: "create" | "conflict";
  readonly reason:
    "governance_template" | "existing_file" | "existing_directory";
}>;

export type PlannedDirectory = Readonly<{
  readonly relativePath: string;
  readonly action: "create_if_needed";
  readonly reason: "governance_structure";
}>;

export type DefaultSetting = Readonly<{
  readonly key: "ui.locale" | "summary.interval_minutes" | "git.default_branch";
  readonly value: string;
}>;

export type PlannedGitAction = Readonly<{
  readonly action:
    | "initialize_local_repository"
    | "preserve_existing_repository"
    | "manual_intervention_required";
  readonly approvalRequired: true;
  readonly commands: readonly string[];
  readonly remoteOperations: readonly [];
}>;

export type GitPreview = Readonly<{
  readonly detected: GitDetection;
  readonly planned: PlannedGitAction;
  readonly writesPerformed: false;
}>;

export type ProjectInitializationPreview = Readonly<{
  readonly projectRoot: string;
  readonly projectName: string;
  readonly idea: string;
  readonly directoryFingerprint: string;
  readonly plannedFiles: readonly PlannedFile[];
  readonly plannedDirectories: readonly PlannedDirectory[];
  readonly conflicts: readonly PlannedFile[];
  readonly defaultWorkflow: readonly Stage[];
  readonly defaultRoles: readonly Role[];
  readonly defaultSettings: readonly DefaultSetting[];
  readonly git: GitPreview;
  readonly writesPerformed: false;
  readonly registryChanged: false;
}>;

export type ProjectInitializationPreviewErrorCode =
  | "invalid_input"
  | "invalid_path"
  | "invalid_idea"
  | "invalid_project_name"
  | "git_unavailable"
  | "invalid_repository";

export type ProjectInitializationPreviewError = Readonly<{
  readonly code: ProjectInitializationPreviewErrorCode;
  readonly message: string;
  readonly details: readonly string[];
}>;

export type ProjectInitializationPreviewResult =
  | Readonly<{
      readonly ok: true;
      readonly value: ProjectInitializationPreview;
    }>
  | Readonly<{
      readonly ok: false;
      readonly error: ProjectInitializationPreviewError;
    }>;

const PLANNED_FILES = [
  ".personal-workspace/project.md",
  ".personal-workspace/workflow.md",
  ".personal-workspace/status.md",
  ".personal-workspace/stages/01-idea/01-idea.md",
  ".personal-workspace/stages/02-discovery/02-discovery.md",
  ".personal-workspace/stages/03-spec/03-spec.md",
  ".personal-workspace/goals/README.md",
  ".personal-workspace/tasks/README.md",
  ".personal-workspace/roles/README.md",
  ".personal-workspace/approvals/README.md",
  ".personal-workspace/issues/README.md",
  ".personal-workspace/decisions/README.md",
  ".personal-workspace/handoffs/README.md",
  ".personal-workspace/reports/README.md",
  ".personal-workspace/executions/README.md",
  ".personal-workspace/audit/events.jsonl",
] as const;

const PLANNED_DIRECTORIES = [
  ".personal-workspace",
  ".personal-workspace/stages",
  ".personal-workspace/stages/01-idea",
  ".personal-workspace/stages/02-discovery",
  ".personal-workspace/stages/03-spec",
  ".personal-workspace/goals",
  ".personal-workspace/tasks",
  ".personal-workspace/roles",
  ".personal-workspace/approvals",
  ".personal-workspace/issues",
  ".personal-workspace/decisions",
  ".personal-workspace/handoffs",
  ".personal-workspace/reports",
  ".personal-workspace/executions",
  ".personal-workspace/audit",
] as const;

const DEFAULT_SETTINGS: readonly DefaultSetting[] = [
  { key: "ui.locale", value: "zh-CN" },
  { key: "summary.interval_minutes", value: "10" },
  { key: "git.default_branch", value: "main" },
];

function failure(
  code: ProjectInitializationPreviewErrorCode,
  message: string,
  details: readonly string[] = [],
): ProjectInitializationPreviewResult {
  return { ok: false, error: { code, message, details } };
}

function mapGitErrorCode(
  code: GitBootstrapErrorCode,
): ProjectInitializationPreviewErrorCode {
  if (
    code === "invalid_path" ||
    code === "git_unavailable" ||
    code === "invalid_repository"
  ) {
    return code;
  }
  return "invalid_repository";
}

async function inspectPlannedFile(
  projectRoot: string,
  relativePath: string,
): Promise<PlannedFile> {
  try {
    const file = await lstat(join(projectRoot, relativePath));
    return {
      relativePath,
      action: "conflict",
      reason: file.isDirectory() ? "existing_directory" : "existing_file",
    };
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return {
        relativePath,
        action: "create",
        reason: "governance_template",
      };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOTDIR"
    ) {
      return {
        relativePath,
        action: "conflict",
        reason: "existing_file",
      };
    }
    throw error;
  }
}

type DirectoryEntry = Readonly<{
  readonly relativePath: string;
  readonly kind: "directory" | "file" | "symlink";
  readonly contentHash: string | null;
}>;

async function collectDirectoryEntries(
  projectRoot: string,
  relativeDirectory = "",
): Promise<readonly DirectoryEntry[]> {
  const directoryPath = join(projectRoot, relativeDirectory);
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const collected: DirectoryEntry[] = [];

  for (const entry of entries.toSorted((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (relativeDirectory === "" && entry.name === ".git") {
      continue;
    }

    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name;
    const absolutePath = join(projectRoot, relativePath);
    const file = await lstat(absolutePath);
    if (file.isDirectory()) {
      collected.push({
        relativePath,
        kind: "directory",
        contentHash: null,
      });
      collected.push(
        ...(await collectDirectoryEntries(projectRoot, relativePath)),
      );
    } else if (file.isSymbolicLink()) {
      collected.push({
        relativePath,
        kind: "symlink",
        contentHash: sha256Content(await readlink(absolutePath)),
      });
    } else {
      collected.push({
        relativePath,
        kind: "file",
        contentHash: sha256Content(await readFile(absolutePath)),
      });
    }
  }

  return collected;
}

async function directoryFingerprint(projectRoot: string): Promise<string> {
  const entries = await collectDirectoryEntries(projectRoot);
  return sha256Content(JSON.stringify(entries));
}

function gitPlan(state: GitRepositoryState): PlannedGitAction {
  if (state === "no_repository") {
    return {
      action: "initialize_local_repository",
      approvalRequired: true,
      commands: [
        "git init --initial-branch=main",
        "git add -- .personal-workspace",
        'git commit --only -m "chore(governance): initialize project baseline" -m "Tasks: TASK-016" -- .personal-workspace',
      ],
      remoteOperations: [],
    };
  }

  if (state === "existing_repository") {
    return {
      action: "preserve_existing_repository",
      approvalRequired: true,
      commands: [
        "git add -- .personal-workspace",
        'git commit --only -m "chore(governance): initialize project baseline" -m "Tasks: TASK-016" -- .personal-workspace',
      ],
      remoteOperations: [],
    };
  }

  return {
    action: "manual_intervention_required",
    approvalRequired: true,
    commands: [],
    remoteOperations: [],
  };
}

export class ProjectInitializationPreviewService {
  private readonly gitBootstrap: GitBootstrapService;

  public constructor(
    gitBootstrap: GitBootstrapService = new GitBootstrapService(),
  ) {
    this.gitBootstrap = gitBootstrap;
  }

  public async preview(
    input: unknown,
  ): Promise<ProjectInitializationPreviewResult> {
    const candidate =
      typeof input === "object" && input !== null && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : null;
    if (
      candidate === null ||
      typeof candidate.projectRoot !== "string" ||
      typeof candidate.idea !== "string" ||
      (candidate.projectName !== undefined &&
        typeof candidate.projectName !== "string")
    ) {
      return failure("invalid_input", "Project root and idea are required.");
    }

    const typedInput = candidate as ProjectInitializationPreviewInput;
    const projectRoot = resolve(typedInput.projectRoot);
    const idea = typedInput.idea.trim();
    const projectName = (
      typedInput.projectName ?? basename(projectRoot)
    ).trim();

    if (idea.length === 0) {
      return failure("invalid_idea", "Project idea cannot be empty.");
    }
    if (projectName.length === 0) {
      return failure("invalid_project_name", "Project name cannot be empty.");
    }

    let root;
    try {
      root = await lstat(projectRoot);
    } catch {
      return failure("invalid_path", "Project root does not exist.", [
        projectRoot,
      ]);
    }
    if (!root.isDirectory()) {
      return failure("invalid_path", "Project root must be a directory.", [
        projectRoot,
      ]);
    }

    const detected = await this.gitBootstrap.detect(projectRoot);
    if (!detected.ok) {
      return failure(
        mapGitErrorCode(detected.error.code),
        detected.error.message,
        detected.error.details,
      );
    }

    const plannedFiles = await Promise.all(
      PLANNED_FILES.map((relativePath) =>
        inspectPlannedFile(projectRoot, relativePath),
      ),
    );
    const fingerprint = await directoryFingerprint(projectRoot);

    return {
      ok: true,
      value: {
        projectRoot,
        projectName,
        idea,
        directoryFingerprint: fingerprint,
        plannedFiles,
        plannedDirectories: PLANNED_DIRECTORIES.map((relativePath) => ({
          relativePath,
          action: "create_if_needed" as const,
          reason: "governance_structure" as const,
        })),
        conflicts: plannedFiles.filter((file) => file.action === "conflict"),
        defaultWorkflow: createDefaultWorkflow().stages,
        defaultRoles: createDefaultRoles(),
        defaultSettings: DEFAULT_SETTINGS,
        git: {
          detected: detected.value,
          planned: gitPlan(detected.value.state),
          writesPerformed: false,
        },
        writesPerformed: false,
        registryChanged: false,
      },
    };
  }
}
