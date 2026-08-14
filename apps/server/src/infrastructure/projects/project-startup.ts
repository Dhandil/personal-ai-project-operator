import type { UtcIsoTimestamp } from "@personal-ai-operator/contracts";

import { GovernanceRepository } from "../files/governance-repository.js";
import type { GovernanceDocument } from "../files/governance-codec.js";
import { StatusProjection } from "../status/status-projection.js";
import {
  ProjectRegistryRepository,
  type ProjectIndexRecord,
} from "../registry/project-registry-repository.js";

export const currentProjectSettingKey = "current_project_key";

export type ProjectListState = "available" | "needs_recovery";

export type ProjectListItem = Readonly<{
  readonly projectKey: string;
  readonly rootPath: string;
  readonly name: string;
  readonly registeredAt: UtcIsoTimestamp;
  readonly lastSeenAt: UtcIsoTimestamp;
  readonly archived: boolean;
  readonly selected: boolean;
  readonly state: ProjectListState;
  readonly status: string;
  readonly statusRevision: number | null;
  readonly statusHash: string | null;
  readonly factsError?: Readonly<{
    readonly code: "project_not_found" | "status_not_found" | "invalid_facts";
    readonly message: string;
  }>;
}>;

export type ProjectList = Readonly<{
  readonly projects: readonly ProjectListItem[];
  readonly currentProjectKey: string | null;
  readonly selectionState: "selected" | "none" | "needs_recovery";
}>;

export type ProjectQueryErrorCode = "registry_failed" | "project_not_found";

export type ProjectQueryError = Readonly<{
  readonly code: ProjectQueryErrorCode;
  readonly message: string;
  readonly details: readonly string[];
}>;

export type ProjectQueryResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: ProjectQueryError }>;

export type ProjectRegistryFactory = () => ProjectRegistryRepository;

export type ProjectQueryServiceOptions = Readonly<{
  readonly registryFactory?: ProjectRegistryFactory;
}>;

type ProjectFacts = Readonly<{
  readonly project: GovernanceDocument;
  readonly status: GovernanceDocument;
  readonly statusRevision: number;
  readonly statusHash: string;
}>;

function failure<Value>(
  code: ProjectQueryErrorCode,
  message: string,
  details: readonly string[] = [],
): ProjectQueryResult<Value> {
  return { ok: false, error: { code, message, details } };
}

function frontMatterString(
  document: GovernanceDocument,
  key: string,
): string | null {
  const value = document.frontMatter[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readStatus(document: GovernanceDocument): string {
  return frontMatterString(document, "status") ?? "unknown";
}

async function readFacts(rootPath: string): Promise<
  | Readonly<{ readonly ok: true; readonly value: ProjectFacts }>
  | Readonly<{
      readonly ok: false;
      readonly code: "project_not_found" | "status_not_found" | "invalid_facts";
      readonly message: string;
    }>
> {
  const governance = new GovernanceRepository(rootPath);
  const project = await governance.read(".personal-workspace/project.md");
  if (!project.ok) {
    return {
      ok: false,
      code:
        project.error.code === "not_found"
          ? "project_not_found"
          : "invalid_facts",
      message: project.error.message,
    };
  }
  if (
    project.value.document.frontMatter.document_type !== "project" ||
    frontMatterString(project.value.document, "name") === null ||
    frontMatterString(project.value.document, "idea") === null
  ) {
    return {
      ok: false,
      code: "invalid_facts",
      message: "The project fact document has invalid metadata.",
    };
  }

  const status = await new StatusProjection(rootPath).read();
  if (!status.ok) {
    return {
      ok: false,
      code:
        status.error.code === "not_found"
          ? "status_not_found"
          : "invalid_facts",
      message: status.error.message,
    };
  }
  return {
    ok: true,
    value: {
      project: project.value.document,
      status: status.value.document,
      statusRevision: status.value.revision,
      statusHash: status.value.hash,
    },
  };
}

function listItem(
  record: ProjectIndexRecord,
  selected: boolean,
  facts: Awaited<ReturnType<typeof readFacts>>,
): ProjectListItem {
  if (!facts.ok) {
    return {
      ...record,
      selected,
      state: "needs_recovery",
      status: "unavailable",
      statusRevision: null,
      statusHash: null,
      factsError: {
        code: facts.code,
        message: facts.message,
      },
    };
  }
  return {
    ...record,
    selected,
    state: "available",
    status: readStatus(facts.value.status),
    statusRevision: facts.value.statusRevision,
    statusHash: facts.value.statusHash,
  };
}

export class ProjectQueryService {
  private readonly registryFactory: ProjectRegistryFactory;

  public constructor(options: ProjectQueryServiceOptions = {}) {
    this.registryFactory =
      options.registryFactory ?? (() => new ProjectRegistryRepository());
  }

  public async list(): Promise<ProjectQueryResult<ProjectList>> {
    let registry: ProjectRegistryRepository;
    try {
      registry = this.registryFactory();
    } catch (error) {
      return failure(
        "registry_failed",
        "The project registry could not be opened.",
        [error instanceof Error ? error.message : String(error)],
      );
    }

    try {
      const records = registry.list();
      if (!records.ok) {
        return failure(
          "registry_failed",
          records.error.message,
          records.error.details,
        );
      }
      const setting = registry.getSetting(currentProjectSettingKey);
      if (!setting.ok) {
        return failure(
          "registry_failed",
          setting.error.message,
          setting.error.details,
        );
      }
      const currentProjectKey = setting.value?.trim() || null;
      const selectedRecord = records.value.find(
        (record) =>
          record.projectKey === currentProjectKey && record.archived === false,
      );
      const projects = await Promise.all(
        records.value.map(async (record) =>
          listItem(
            record,
            record.projectKey === selectedRecord?.projectKey,
            await readFacts(record.rootPath),
          ),
        ),
      );
      return {
        ok: true,
        value: {
          projects,
          currentProjectKey: selectedRecord?.projectKey ?? null,
          selectionState:
            currentProjectKey === null
              ? "none"
              : selectedRecord === undefined
                ? "needs_recovery"
                : "selected",
        },
      };
    } finally {
      registry.close();
    }
  }

  public async selectCurrent(
    projectKey: string,
  ): Promise<ProjectQueryResult<ProjectList>> {
    if (!/^[a-f0-9]{64}$/.test(projectKey)) {
      return failure("project_not_found", "Project key is invalid.");
    }
    let registry: ProjectRegistryRepository;
    try {
      registry = this.registryFactory();
    } catch (error) {
      return failure(
        "registry_failed",
        "The project registry could not be opened.",
        [error instanceof Error ? error.message : String(error)],
      );
    }
    try {
      const records = registry.list();
      if (!records.ok) {
        return failure(
          "registry_failed",
          records.error.message,
          records.error.details,
        );
      }
      const record = records.value.find(
        (candidate) =>
          candidate.projectKey === projectKey && candidate.archived === false,
      );
      if (record === undefined) {
        return failure(
          "project_not_found",
          "Project is not registered or is archived.",
        );
      }
      const saved = registry.setSetting(currentProjectSettingKey, projectKey);
      if (!saved.ok) {
        return failure(
          "registry_failed",
          saved.error.message,
          saved.error.details,
        );
      }
    } finally {
      registry.close();
    }
    return this.list();
  }
}

export type StartupSummary = Readonly<{
  readonly goal: string;
  readonly approvedShortTermGoal: string;
  readonly completedResults: string;
  readonly currentTask: string;
  readonly blockersRisksDecisions: string;
  readonly lastStep: string;
  readonly recommendedNext: string;
  readonly userActionNeeded: string;
}>;

export type ProjectStartupValue = Readonly<{
  readonly started: boolean;
  readonly autoStarted: false;
  readonly needsRecovery: boolean;
  readonly needsUserAction: boolean;
  readonly action:
    "select_project" | "review_project_facts" | "continue_with_user_approval";
  readonly project: Readonly<{
    readonly projectKey: string;
    readonly rootPath: string;
    readonly name: string;
    readonly idea: string;
  }> | null;
  readonly currentStatus: Readonly<{
    readonly status: string;
    readonly revision: number;
    readonly hash: string;
  }> | null;
  readonly summary: StartupSummary | null;
}>;

export type ProjectStartupResult =
  | Readonly<{ readonly ok: true; readonly value: ProjectStartupValue }>
  | Readonly<{ readonly ok: false; readonly error: ProjectQueryError }>;

type StatusSection = Readonly<{
  readonly heading: string;
  readonly content: string;
}>;

function sections(body: string): readonly StatusSection[] {
  const lines = body.split("\n");
  const headings = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.startsWith("## "));
  return headings.map(({ index }, position) => {
    const next = headings[position + 1]?.index ?? lines.length;
    return {
      heading: lines[index]?.slice(3).trim() ?? "",
      content: lines
        .slice(index + 1, next)
        .join("\n")
        .trim(),
    };
  });
}

function startupSummary(
  idea: string,
  status: GovernanceDocument,
): StartupSummary {
  const values = sections(status.body);
  const contentAt = (index: number): string => values[index]?.content ?? "";
  const contentFor = (terms: readonly string[], fallback: number): string => {
    const section = values.find(({ heading }) => {
      const normalized = heading.toLocaleLowerCase();
      return terms.some((term) => normalized.includes(term));
    });
    return section?.content ?? contentAt(fallback);
  };
  return {
    goal: idea,
    approvedShortTermGoal: contentFor(["short", "goal", "短期", "目标"], 0),
    completedResults: contentFor(["complete", "result", "完成", "成果"], 1),
    currentTask: contentFor(["current task", "当前任务"], 2),
    blockersRisksDecisions: contentFor(
      ["blocker", "risk", "decision", "阻塞", "风险", "决策"],
      3,
    ),
    lastStep: contentFor(["last", "上一步"], 4),
    recommendedNext: contentFor(["recommend", "next", "推荐", "下一步"], 5),
    userActionNeeded: contentFor(["user", "action", "用户", "待办"], 6),
  };
}

export type ProjectStartupServiceOptions = Readonly<{
  readonly queryService?: ProjectQueryService;
  readonly registryFactory?: ProjectRegistryFactory;
}>;

export class ProjectStartupService {
  private readonly queryService: ProjectQueryService;

  public constructor(options: ProjectStartupServiceOptions = {}) {
    const registryFactory =
      options.registryFactory ?? (() => new ProjectRegistryRepository());
    this.queryService =
      options.queryService ?? new ProjectQueryService({ registryFactory });
  }

  public async start(projectKey?: string): Promise<ProjectStartupResult> {
    const listed = await this.queryService.list();
    if (!listed.ok) {
      return listed;
    }
    const selectedKey = projectKey ?? listed.value.currentProjectKey;
    if (selectedKey === null || selectedKey === undefined) {
      return {
        ok: true,
        value: {
          started: false,
          autoStarted: false,
          needsRecovery: false,
          needsUserAction: true,
          action: "select_project",
          project: null,
          currentStatus: null,
          summary: null,
        },
      };
    }

    const record = listed.value.projects.find(
      (candidate) => candidate.projectKey === selectedKey,
    );
    if (record === undefined) {
      return {
        ok: false,
        error: {
          code: "project_not_found",
          message: "Project is not registered or is archived.",
          details: [selectedKey],
        },
      };
    }

    const facts = await readFacts(record.rootPath);
    if (!facts.ok) {
      return {
        ok: true,
        value: {
          started: false,
          autoStarted: false,
          needsRecovery: true,
          needsUserAction: true,
          action: "review_project_facts",
          project: {
            projectKey: record.projectKey,
            rootPath: record.rootPath,
            name: record.name,
            idea: "",
          },
          currentStatus: null,
          summary: null,
        },
      };
    }

    const idea = frontMatterString(facts.value.project, "idea") ?? "";
    const name = frontMatterString(facts.value.project, "name") ?? record.name;
    const summary = startupSummary(idea, facts.value.status);
    return {
      ok: true,
      value: {
        started: true,
        autoStarted: false,
        needsRecovery: false,
        needsUserAction: summary.userActionNeeded.length > 0,
        action: "continue_with_user_approval",
        project: {
          projectKey: record.projectKey,
          rootPath: record.rootPath,
          name,
          idea,
        },
        currentStatus: {
          status: readStatus(facts.value.status),
          revision: facts.value.statusRevision,
          hash: facts.value.statusHash,
        },
        summary,
      },
    };
  }
}
