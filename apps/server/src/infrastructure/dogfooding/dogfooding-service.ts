import { readFile, readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { relative, resolve } from "node:path";

import type { UtcIsoTimestamp } from "@personal-ai-operator/contracts";
import {
  DEFAULT_STAGE_DEFINITIONS,
  createDefaultWorkflow,
} from "@personal-ai-operator/domain";

import { writeFileAtomically } from "../files/atomic-file-writer.js";
import {
  decodeGovernanceDocument,
  type GovernanceDocument,
} from "../files/governance-codec.js";
import { GovernanceRepository } from "../files/governance-repository.js";
import { sha256Content } from "../files/content-hash.js";

export const dogfoodingManifestPath =
  ".personal-workspace/dogfooding/TASK-031-manifest.json";
export const dogfoodingReportDirectory = ".personal-workspace/reports";

type SourceKind = "stage" | "goal" | "task" | "approval" | "report";

export type DogfoodingSourceFile = Readonly<{
  readonly relativePath: string;
  readonly kind: SourceKind;
  readonly hash: string;
  readonly id: string | null;
  readonly title: string | null;
  readonly status: string | null;
  readonly stage: string | null;
  readonly goalId: string | null;
  readonly generated: boolean;
  readonly revision: number | null;
}>;

export type DogfoodingInventory = Readonly<{
  readonly sourceFiles: readonly DogfoodingSourceFile[];
  readonly stages: readonly DogfoodingSourceFile[];
  readonly goals: readonly DogfoodingSourceFile[];
  readonly tasks: readonly DogfoodingSourceFile[];
  readonly approvals: readonly DogfoodingSourceFile[];
  readonly reports: readonly DogfoodingSourceFile[];
  readonly currentSourceStage: string;
  readonly currentGoalId: string | null;
  readonly currentTaskId: string | null;
  readonly sourceManifestHash: string;
}>;

export type DogfoodingHistoricalSnapshot = Readonly<{
  readonly schema_version: 1;
  readonly snapshot_kind: "historical_task_snapshot";
  readonly task_id: "TASK-031";
  readonly snapshot_boundary: string;
  readonly snapshot_at: UtcIsoTimestamp;
  readonly snapshot_label: string;
  readonly source_manifest_hash: string;
  readonly current_source_stage: string;
  readonly current_goal_id: string | null;
  readonly current_task_id: string | null;
  readonly source_files: readonly DogfoodingSourceFile[];
}>;

type DogfoodingSnapshotMetadata = Readonly<{
  readonly snapshot_kind: "historical_task_snapshot";
  readonly snapshot_task_id: "TASK-031";
  readonly snapshot_boundary: string;
  readonly snapshot_at: UtcIsoTimestamp;
  readonly snapshot_label: string;
}>;

export type DogfoodingImport = Readonly<{
  readonly inventory: DogfoodingInventory;
  readonly createdFiles: readonly string[];
  readonly rebuiltFiles: readonly string[];
  readonly reportRelativePath: string;
  readonly manifestRelativePath: typeof dogfoodingManifestPath;
}>;

export type DogfoodingErrorCode =
  "invalid_source" | "write_failed" | "report_collision";

export type DogfoodingError = Readonly<{
  readonly code: DogfoodingErrorCode;
  readonly message: string;
  readonly details: readonly string[];
}>;

export type DogfoodingResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: DogfoodingError }>;

export type DogfoodingServiceOptions = Readonly<{
  readonly now?: () => UtcIsoTimestamp;
}>;

type SourceDocument = Readonly<{
  readonly source: DogfoodingSourceFile;
  readonly document: GovernanceDocument;
}>;

function failure<Value>(
  code: DogfoodingErrorCode,
  message: string,
  details: readonly string[] = [],
): DogfoodingResult<Value> {
  return { ok: false, error: { code, message, details } };
}

function timestamp(): UtcIsoTimestamp {
  return new Date().toISOString() as UtcIsoTimestamp;
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

function frontMatterRevision(document: GovernanceDocument): number | null {
  const value = document.frontMatter.revision;
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function numericId(value: string | null): number {
  const match = value?.match(/(?:TASK|GOAL|REPORT)-(\d+)/);
  const capture = match?.[1];
  return capture === undefined ? Number.MAX_SAFE_INTEGER : Number(capture);
}

function sourceSort(left: DogfoodingSourceFile, right: DogfoodingSourceFile) {
  return (
    left.relativePath.localeCompare(right.relativePath) ||
    (left.id ?? "").localeCompare(right.id ?? "")
  );
}

async function readSourceDirectory(
  projectRoot: string,
  relativeDirectory: string,
  kind: SourceKind,
): Promise<DogfoodingResult<readonly SourceDocument[]>> {
  const directory = resolve(projectRoot, relativeDirectory);
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    return failure("invalid_source", `Cannot read ${relativeDirectory}.`, [
      error instanceof Error ? error.message : String(error),
    ]);
  }

  const documents: SourceDocument[] = [];
  for (const entry of entries.toSorted((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (entry.isDirectory() && kind === "stage") {
      const nested = await readSourceDirectory(
        projectRoot,
        `${relativeDirectory}/${entry.name}`,
        kind,
      );
      if (!nested.ok) return nested;
      documents.push(...nested.value);
      continue;
    }
    if (
      !entry.isFile() ||
      !entry.name.endsWith(".md") ||
      (kind === "task" && entry.name === "todo.md")
    ) {
      continue;
    }
    const relativePath = `${relativeDirectory}/${entry.name}`;
    try {
      const bytes = await readFile(resolve(projectRoot, relativePath));
      const decoded = decodeGovernanceDocument(bytes);
      if (!decoded.ok) {
        return failure(
          "invalid_source",
          `Formal source ${relativePath} is invalid.`,
          [decoded.error.code, ...decoded.error.details],
        );
      }
      documents.push({
        source: {
          relativePath,
          kind,
          hash: sha256Content(bytes),
          id: frontMatterString(decoded.value, "id"),
          title: frontMatterString(decoded.value, "title"),
          status: frontMatterString(decoded.value, "status"),
          stage: frontMatterString(decoded.value, "stage"),
          goalId: frontMatterString(decoded.value, "goal_id"),
          generated:
            kind === "report" &&
            frontMatterString(decoded.value, "report_type") === "dogfooding" &&
            frontMatterString(decoded.value, "task_id") === "TASK-031",
          revision: frontMatterRevision(decoded.value),
        },
        document: decoded.value,
      });
    } catch (error) {
      return failure(
        "invalid_source",
        `Formal source ${relativePath} is unreadable.`,
        [error instanceof Error ? error.message : String(error)],
      );
    }
  }
  return { ok: true, value: documents };
}

function sourceManifestHash(sources: readonly DogfoodingSourceFile[]): string {
  return sha256Content(
    JSON.stringify(
      sources
        .filter((source) => !source.generated)
        .toSorted(sourceSort)
        .map((source) => ({
          path: source.relativePath,
          kind: source.kind,
          hash: source.hash,
          id: source.id,
          title: source.title,
          status: source.status,
          stage: source.stage,
          goalId: source.goalId,
          generated: source.generated,
          revision: source.revision,
        })),
    ),
  );
}

function currentSourceStage(stages: readonly DogfoodingSourceFile[]): string {
  const withStageNumber = stages
    .map((stage) => ({
      stage,
      number: Number(stage.relativePath.match(/(\d+)-/)?.[1] ?? 0),
    }))
    .toSorted((left, right) => right.number - left.number);
  const declaredStage = withStageNumber[0]?.stage.stage;
  if (declaredStage !== null && declaredStage !== undefined) {
    return declaredStage;
  }
  const path = withStageNumber[0]?.stage.relativePath.replaceAll("\\", "/");
  const parts = path?.split("/") ?? [];
  const stagesIndex = parts.indexOf("stages");
  return stagesIndex >= 0 ? (parts[stagesIndex + 1] ?? "unknown") : "unknown";
}

function activeTaskStatus(status: string | null): boolean {
  return (
    status === "ready" ||
    status === "in_progress" ||
    status === "in_review" ||
    status === "blocked" ||
    status === "changes_requested" ||
    status === "paused"
  );
}

function currentTask(tasks: readonly DogfoodingSourceFile[]): string | null {
  return (
    tasks
      .filter((task) => activeTaskStatus(task.status))
      .toSorted((left, right) => numericId(left.id) - numericId(right.id))[0]
      ?.id ?? null
  );
}

function currentGoal(
  tasks: readonly SourceDocument[],
  goals: readonly DogfoodingSourceFile[],
  currentTaskId: string | null,
): string | null {
  const task = tasks.find((candidate) => candidate.source.id === currentTaskId);
  const goalId = task?.document.frontMatter.goal_id;
  if (typeof goalId === "string" && goals.some((goal) => goal.id === goalId)) {
    return goalId;
  }
  return (
    goals
      .filter(
        (goal) => goal.status === "in_progress" || goal.status === "ready",
      )
      .toSorted((left, right) => numericId(left.id) - numericId(right.id))[0]
      ?.id ?? null
  );
}

function inventoryFrom(
  stages: readonly SourceDocument[],
  goals: readonly SourceDocument[],
  tasks: readonly SourceDocument[],
  approvals: readonly SourceDocument[],
  reports: readonly SourceDocument[],
): DogfoodingInventory {
  const sourceFiles = [
    ...stages.map(({ source }) => source),
    ...goals.map(({ source }) => source),
    ...tasks.map(({ source }) => source),
    ...approvals.map(({ source }) => source),
    ...reports.map(({ source }) => source),
  ].toSorted(sourceSort);
  const taskSources = tasks.map(({ source }) => source);
  const currentTaskId = currentTask(taskSources);
  return {
    sourceFiles,
    stages: stages.map(({ source }) => source).toSorted(sourceSort),
    goals: goals.map(({ source }) => source).toSorted(sourceSort),
    tasks: taskSources.toSorted(sourceSort),
    approvals: approvals.map(({ source }) => source).toSorted(sourceSort),
    reports: reports.map(({ source }) => source).toSorted(sourceSort),
    currentSourceStage: currentSourceStage(stages.map(({ source }) => source)),
    currentGoalId: currentGoal(
      tasks,
      goals.map(({ source }) => source),
      currentTaskId,
    ),
    currentTaskId,
    sourceManifestHash: sourceManifestHash(sourceFiles),
  };
}

function inventoryFromHistoricalSnapshot(
  snapshot: DogfoodingHistoricalSnapshot,
): DogfoodingResult<DogfoodingInventory> {
  const sourceFiles = snapshot.source_files.toSorted(sourceSort);
  const expectedHash = sourceManifestHash(sourceFiles);
  if (expectedHash !== snapshot.source_manifest_hash) {
    return failure(
      "invalid_source",
      "Historical snapshot source manifest hash does not match its source files.",
      [
        `Expected ${expectedHash}.`,
        `Received ${snapshot.source_manifest_hash}.`,
      ],
    );
  }
  if (
    snapshot.current_source_stage !== "03-spec" ||
    snapshot.current_goal_id !== "GOAL-006" ||
    snapshot.current_task_id !== "TASK-031"
  ) {
    return failure(
      "invalid_source",
      "TASK-031 historical snapshot must identify its original active work.",
    );
  }
  const byKind = (kind: SourceKind) =>
    sourceFiles.filter((source) => source.kind === kind).toSorted(sourceSort);
  return {
    ok: true,
    value: {
      sourceFiles,
      stages: byKind("stage"),
      goals: byKind("goal"),
      tasks: byKind("task"),
      approvals: byKind("approval"),
      reports: byKind("report"),
      currentSourceStage: snapshot.current_source_stage,
      currentGoalId: snapshot.current_goal_id,
      currentTaskId: snapshot.current_task_id,
      sourceManifestHash: snapshot.source_manifest_hash,
    },
  };
}

function sourceCounts(inventory: DogfoodingInventory) {
  return {
    stages: inventory.stages.length,
    goals: inventory.goals.length,
    tasks: inventory.tasks.length,
    approvals: inventory.approvals.length,
    reports: inventory.reports.length,
  };
}

function stageTitle(key: string): string {
  return (
    DEFAULT_STAGE_DEFINITIONS.find((stage) => stage.key === key)?.title ?? key
  );
}

function projectDocument(now: UtcIsoTimestamp): GovernanceDocument {
  return {
    frontMatter: {
      schema_version: 1,
      document_type: "project",
      revision: 1,
      created_at: now,
      updated_at: now,
      name: "个人 AI 项目运营工具",
      idea: "建设一个供个人使用的、任务驱动的 AI 项目工作台。",
      imported_from: ".personal-workspace/stages/03-spec/03-spec.md",
    },
    body: "# 个人 AI 项目运营工具\n\n本文件由 TASK-031 从已确认的项目 Spec 建立项目身份。正式阶段、目标和任务文件仍是事实源。\n",
  };
}

function workflowDocument(
  inventory: DogfoodingInventory,
  now: UtcIsoTimestamp,
): GovernanceDocument {
  const workflow = createDefaultWorkflow();
  const stages = workflow.stages.map((stage) => ({
    ...stage,
    status: stage.key === "execution" ? "in_progress" : "completed",
  }));
  return {
    frontMatter: {
      schema_version: 1,
      document_type: "workflow",
      revision: 1,
      created_at: now,
      updated_at: now,
      current_stage: "execution",
      source_stage: inventory.currentSourceStage,
      stages,
    },
    body: [
      "# 默认工作流",
      "",
      `当前正式源阶段：${inventory.currentSourceStage}`,
      "",
      ...stages.map(
        (stage) =>
          `- ${stage.order}. ${stageTitle(stage.key)} — ${stage.status}`,
      ),
      "",
      "工作流视图由正式阶段事实映射生成；未经确认的历史阶段内容未被覆盖。",
      "",
    ].join("\n"),
  };
}

function statusDocument(
  inventory: DogfoodingInventory,
  now: UtcIsoTimestamp,
  revision: number,
): GovernanceDocument {
  const completedTasks = inventory.tasks.filter(
    (task) => task.status === "completed",
  );
  const activeTasks = inventory.tasks.filter((task) =>
    activeTaskStatus(task.status),
  );
  return {
    frontMatter: {
      schema_version: 1,
      document_type: "status_snapshot",
      revision,
      generated_at: now,
      updated_at: now,
      source: "formal_project_facts",
      status: "in_progress",
      current_stage: inventory.currentSourceStage,
      current_goal: inventory.currentGoalId,
      current_task: inventory.currentTaskId,
      source_manifest_hash: inventory.sourceManifestHash,
    },
    body: [
      "# 项目状态",
      "",
      "- 项目：个人 AI 项目运营工具",
      `- 当前正式源阶段：${inventory.currentSourceStage}`,
      `- 当前目标：${inventory.currentGoalId ?? "无"}`,
      `- 当前任务：${inventory.currentTaskId ?? "无"}`,
      "- 本文件由正式项目事实自动生成，不是独立事实源。",
      "",
      "## 当前获批短期目标",
      `- ${inventory.currentGoalId ?? "无当前目标"}`,
      "",
      "## 已完成成果",
      completedTasks.length === 0
        ? "- 无"
        : completedTasks
            .map((task) => `- ${task.id} ${task.title ?? ""}`)
            .join("\n"),
      "",
      "## 当前任务",
      activeTasks.length === 0
        ? "- 无"
        : activeTasks
            .map((task) => `- ${task.id} ${task.title ?? ""} — ${task.status}`)
            .join("\n"),
      "",
      "## Blocker、风险和待决策事项",
      "- 以正式问题、审批和决策记录为准。",
      "",
      "## 上一步",
      `- 已从 ${inventory.sourceFiles.length} 个正式文件重建导入清单。`,
      "",
      "## 推荐下一步",
      `- 由项目负责人继续处理 ${inventory.currentTaskId ?? "当前就绪任务"}。`,
      "",
      "## 用户待办",
      "- 验收 TASK-031 的 Dogfooding 报告后，再决定是否进入后续目标。",
      "",
    ].join("\n"),
  };
}

function renderTodo(
  inventory: DogfoodingInventory,
  now: UtcIsoTimestamp,
): string {
  const lines = [
    "# Task List：个人 AI 项目运营工具",
    "",
    "> 本文件由 `.personal-workspace/tasks/TASK-xxx.md` 正式任务卡生成。",
    "> 禁止在本文件中独立修改状态；正式状态以任务卡为准。",
    `> 生成时间：${now}`,
    "",
  ];
  for (const goal of inventory.goals) {
    lines.push(
      `## ${goal.id ?? "GOAL-UNKNOWN"}：${goal.title ?? "未命名目标"}`,
      "",
    );
    const tasks = inventory.tasks.filter((task) => task.goalId === goal.id);
    if (tasks.length === 0) {
      lines.push("- 暂无任务", "");
      continue;
    }
    for (const task of tasks) {
      const checked = task.status === "completed" ? "x" : " ";
      lines.push(`- [${checked}] ${task.id} ${task.title ?? "未命名任务"}`);
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function nextReportId(reports: readonly DogfoodingSourceFile[]): string {
  const max = reports.reduce(
    (current, report) => Math.max(current, numericId(report.id)),
    0,
  );
  return `REPORT-${String(max + 1).padStart(3, "0")}`;
}

function reportDocument(
  inventory: DogfoodingInventory,
  reportId: string,
  now: UtcIsoTimestamp,
): GovernanceDocument {
  return {
    frontMatter: {
      schema_version: 1,
      document_type: "report",
      id: reportId,
      title: "TASK-031 Dogfooding 导入与自举报告",
      status: "draft",
      report_type: "dogfooding",
      acceptance_state: "pending_user_acceptance",
      task_id: "TASK-031",
      goal_id: "GOAL-006",
      revision: 1,
      created_at: now,
      updated_at: now,
      source_manifest_hash: inventory.sourceManifestHash,
      source_counts: {
        stages: inventory.stages.length,
        goals: inventory.goals.length,
        tasks: inventory.tasks.length,
        approvals: inventory.approvals.length,
        reports: inventory.reports.length,
      },
    },
    body: [
      `# ${reportId}：TASK-031 Dogfooding 导入与自举报告`,
      "",
      "## 结论",
      "本项目已使用自身正式治理文件建立 V0 可读取的项目身份、工作流、状态快照和兼容任务视图。用户验收仍待完成。",
      "",
      "## 正式事实清单",
      `- 当前源阶段：${inventory.currentSourceStage}`,
      `- 当前目标：${inventory.currentGoalId ?? "无"}`,
      `- 当前任务：${inventory.currentTaskId ?? "无"}`,
      `- 阶段文件：${inventory.stages.length}`,
      `- 目标文件：${inventory.goals.length}`,
      `- 任务卡：${inventory.tasks.length}`,
      `- 审批记录：${inventory.approvals.length}`,
      `- 报告：${inventory.reports.length}`,
      `- 源文件清单 SHA-256：${inventory.sourceManifestHash}`,
      "",
      "## 无损与边界",
      "- 导入层只记录正式文件路径、哈希和必要索引字段；原始 Markdown/YAML 未被重编码或覆盖。",
      "- 未确认历史阶段内容未被修改；项目身份、工作流和状态是从正式事实生成的辅助视图。",
      "- `status.md` 与 `tasks/todo.md` 不能反向成为事实源。",
      "",
      "## V0 读取与恢复证据",
      "- 生成项目身份：.personal-workspace/project.md。",
      "- 生成工作流映射：.personal-workspace/workflow.md。",
      "- 生成状态快照：.personal-workspace/status.md。",
      "- 生成兼容视图：.personal-workspace/tasks/todo.md 与 tasks/todo.md。",
      `- 机器可读清单：${dogfoodingManifestPath}。`,
      "- 专项测试验证扫描、哈希稳定性、删除后重建和未知 YAML 字段保留。",
      "",
      "## 用户验收",
      "请用户对照正式阶段、目标、任务卡和应用视图；确认无信息丢失后，将本报告状态更新为 accepted。",
      "",
    ].join("\n"),
  };
}

function historicalView(
  document: GovernanceDocument,
  inventory: DogfoodingInventory,
  metadata: DogfoodingSnapshotMetadata,
): GovernanceDocument {
  return {
    frontMatter: {
      ...document.frontMatter,
      current_source_stage: inventory.currentSourceStage,
      current_goal_id: inventory.currentGoalId,
      current_task_id: inventory.currentTaskId,
      source_manifest_hash: inventory.sourceManifestHash,
      source_counts: sourceCounts(inventory),
      ...metadata,
    },
    body: document.body,
  };
}

function historicalReportDocument(
  inventory: DogfoodingInventory,
  reportId: string,
  now: UtcIsoTimestamp,
  revision: number,
  createdAt: UtcIsoTimestamp,
  metadata: DogfoodingSnapshotMetadata,
): GovernanceDocument {
  const document = reportDocument(inventory, reportId, now);
  const body = document.body.trimEnd();
  return {
    frontMatter: {
      ...document.frontMatter,
      current_source_stage: inventory.currentSourceStage,
      current_goal_id: inventory.currentGoalId,
      current_task_id: inventory.currentTaskId,
      source_counts: sourceCounts(inventory),
      revision,
      created_at: createdAt,
      updated_at: now,
      ...metadata,
    },
    body: `${body}\n\n## 历史快照边界\n- 本报告是 ${metadata.snapshot_task_id} 在 ${metadata.snapshot_at} 执行时的历史事实快照（${metadata.snapshot_label}）。\n- 快照边界：${metadata.snapshot_boundary}。后续 TASK-035 及其后续事实不属于本报告。\n- 当前工作区的 status.md 可能反映后续事实；本报告只与同一快照标记的自举产物对照。\n`,
  };
}

export class DogfoodingService {
  private readonly projectRoot: string;
  private readonly now: () => UtcIsoTimestamp;

  public constructor(
    projectRoot: string,
    options: DogfoodingServiceOptions = {},
  ) {
    this.projectRoot = resolve(projectRoot);
    this.now = options.now ?? timestamp;
  }

  public async inspect(): Promise<DogfoodingResult<DogfoodingInventory>> {
    const [stages, goals, tasks, approvals, reports] = await Promise.all([
      readSourceDirectory(
        this.projectRoot,
        ".personal-workspace/stages",
        "stage",
      ),
      readSourceDirectory(
        this.projectRoot,
        ".personal-workspace/goals",
        "goal",
      ),
      readSourceDirectory(
        this.projectRoot,
        ".personal-workspace/tasks",
        "task",
      ),
      readSourceDirectory(
        this.projectRoot,
        ".personal-workspace/approvals",
        "approval",
      ),
      readSourceDirectory(
        this.projectRoot,
        dogfoodingReportDirectory,
        "report",
      ),
    ]);
    const results = [stages, goals, tasks, approvals, reports];
    const failed = results.find((result) => !result.ok);
    if (failed !== undefined && !failed.ok) {
      return failed;
    }
    if (!stages.ok || !goals.ok || !tasks.ok || !approvals.ok || !reports.ok) {
      return failure(
        "invalid_source",
        "Formal governance source could not be scanned.",
      );
    }
    return {
      ok: true,
      value: inventoryFrom(
        stages.value,
        goals.value,
        tasks.value,
        approvals.value,
        reports.value,
      ),
    };
  }

  public async importAndRebuild(): Promise<DogfoodingResult<DogfoodingImport>> {
    const inspected = await this.inspect();
    if (!inspected.ok) return inspected;
    const inventory = inspected.value;
    const now = this.now();
    const repository = new GovernanceRepository(this.projectRoot);
    const createdFiles: string[] = [];
    const rebuiltFiles: string[] = [];

    const created = await this.writeIfMissing(
      repository,
      ".personal-workspace/project.md",
      projectDocument(now),
    );
    if (!created.ok) return created;
    if (created.value) createdFiles.push(".personal-workspace/project.md");

    const workflow = await this.writeIfMissing(
      repository,
      ".personal-workspace/workflow.md",
      workflowDocument(inventory, now),
    );
    if (!workflow.ok) return workflow;
    if (workflow.value) createdFiles.push(".personal-workspace/workflow.md");

    const statusCurrent = await repository.read(
      ".personal-workspace/status.md",
    );
    if (!statusCurrent.ok && statusCurrent.error.code !== "not_found") {
      return failure(
        "write_failed",
        "Existing status snapshot could not be read.",
        [statusCurrent.error.message],
      );
    }
    const statusRevision = statusCurrent.ok
      ? statusCurrent.value.version.revision + 1
      : 1;
    const status = await repository.write(
      ".personal-workspace/status.md",
      statusDocument(inventory, now, statusRevision),
      statusCurrent.ok ? statusCurrent.value.version : null,
    );
    if (!status.ok)
      return failure(
        "write_failed",
        status.error.message,
        status.error.details,
      );
    if (statusCurrent.ok) rebuiltFiles.push(".personal-workspace/status.md");
    else createdFiles.push(".personal-workspace/status.md");

    const todo = renderTodo(inventory, now);
    for (const relativePath of [
      ".personal-workspace/tasks/todo.md",
      "tasks/todo.md",
    ]) {
      const written = await writeFileAtomically(
        resolve(this.projectRoot, relativePath),
        todo,
      );
      if (!written.ok)
        return failure(
          "write_failed",
          written.error.message,
          written.error.details,
        );
      rebuiltFiles.push(relativePath);
    }

    const manifest = {
      schema_version: 1,
      task_id: "TASK-031",
      generated_at: now,
      source_manifest_hash: inventory.sourceManifestHash,
      current_source_stage: inventory.currentSourceStage,
      current_goal_id: inventory.currentGoalId,
      current_task_id: inventory.currentTaskId,
      source_files: inventory.sourceFiles,
    };
    const manifestWritten = await writeFileAtomically(
      resolve(this.projectRoot, dogfoodingManifestPath),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    if (!manifestWritten.ok)
      return failure(
        "write_failed",
        manifestWritten.error.message,
        manifestWritten.error.details,
      );
    rebuiltFiles.push(dogfoodingManifestPath);

    const existingDogfoodingReport = inventory.reports
      .filter((report) => report.generated)
      .toSorted((left, right) => numericId(right.id) - numericId(left.id))[0];
    const reportRelativePath =
      existingDogfoodingReport?.relativePath ??
      `${dogfoodingReportDirectory}/${nextReportId(inventory.reports)}.md`;
    if (existingDogfoodingReport === undefined) {
      const reportId = nextReportId(inventory.reports);
      const reportExisting = await repository.read(reportRelativePath);
      if (reportExisting.ok)
        return failure(
          "report_collision",
          `Dogfooding report ${reportId} already exists.`,
          [reportRelativePath],
        );
      if (reportExisting.error.code !== "not_found")
        return failure("write_failed", reportExisting.error.message);
      const report = await repository.write(
        reportRelativePath,
        reportDocument(inventory, reportId, now),
        null,
      );
      if (!report.ok)
        return failure(
          "write_failed",
          report.error.message,
          report.error.details,
        );
      createdFiles.push(reportRelativePath);
    }

    return {
      ok: true,
      value: {
        inventory,
        createdFiles,
        rebuiltFiles,
        reportRelativePath,
        manifestRelativePath: dogfoodingManifestPath,
      },
    };
  }

  public async rebuildHistoricalSnapshot(
    snapshot: DogfoodingHistoricalSnapshot,
  ): Promise<DogfoodingResult<DogfoodingImport>> {
    const inspected = inventoryFromHistoricalSnapshot(snapshot);
    if (!inspected.ok) return inspected;

    const inventory = inspected.value;
    const metadata: DogfoodingSnapshotMetadata = {
      snapshot_kind: snapshot.snapshot_kind,
      snapshot_task_id: snapshot.task_id,
      snapshot_boundary: snapshot.snapshot_boundary,
      snapshot_at: snapshot.snapshot_at,
      snapshot_label: snapshot.snapshot_label,
    };
    const now = this.now();
    const repository = new GovernanceRepository(this.projectRoot);
    const createdFiles: string[] = [];
    const rebuiltFiles: string[] = [];

    for (const [relativePath, document] of [
      [
        ".personal-workspace/project.md",
        historicalView(projectDocument(now), inventory, metadata),
      ],
      [
        ".personal-workspace/workflow.md",
        historicalView(workflowDocument(inventory, now), inventory, metadata),
      ],
    ] as const) {
      const written = await this.writeHistoricalGenerated(
        repository,
        relativePath,
        document,
      );
      if (!written.ok) return written;
      (written.value === "created" ? createdFiles : rebuiltFiles).push(
        relativePath,
      );
    }

    const statusCurrent = await repository.read(
      ".personal-workspace/status.md",
    );
    if (!statusCurrent.ok && statusCurrent.error.code !== "not_found") {
      return failure(
        "write_failed",
        "Existing status snapshot could not be read.",
        [statusCurrent.error.message],
      );
    }
    const statusRevision = statusCurrent.ok
      ? statusCurrent.value.version.revision + 1
      : 1;
    const status = await repository.write(
      ".personal-workspace/status.md",
      historicalView(
        statusDocument(inventory, now, statusRevision),
        inventory,
        metadata,
      ),
      statusCurrent.ok ? statusCurrent.value.version : null,
    );
    if (!status.ok)
      return failure(
        "write_failed",
        status.error.message,
        status.error.details,
      );
    (statusCurrent.ok ? rebuiltFiles : createdFiles).push(
      ".personal-workspace/status.md",
    );

    const todo = renderTodo(inventory, now);
    for (const relativePath of [
      ".personal-workspace/tasks/todo.md",
      "tasks/todo.md",
    ]) {
      const written = await writeFileAtomically(
        resolve(this.projectRoot, relativePath),
        todo,
      );
      if (!written.ok)
        return failure(
          "write_failed",
          written.error.message,
          written.error.details,
        );
      rebuiltFiles.push(relativePath);
    }

    const manifest = {
      schema_version: 1,
      task_id: "TASK-031",
      generated_at: now,
      source_manifest_hash: inventory.sourceManifestHash,
      current_source_stage: inventory.currentSourceStage,
      current_goal_id: inventory.currentGoalId,
      current_task_id: inventory.currentTaskId,
      source_files: inventory.sourceFiles,
      ...metadata,
    };
    const manifestWritten = await writeFileAtomically(
      resolve(this.projectRoot, dogfoodingManifestPath),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    if (!manifestWritten.ok)
      return failure(
        "write_failed",
        manifestWritten.error.message,
        manifestWritten.error.details,
      );
    rebuiltFiles.push(dogfoodingManifestPath);

    const reportRelativePath = `${dogfoodingReportDirectory}/REPORT-032.md`;
    const reportCurrent = await repository.read(reportRelativePath);
    if (!reportCurrent.ok && reportCurrent.error.code !== "not_found") {
      return failure("write_failed", reportCurrent.error.message);
    }
    const reportId = "REPORT-032";
    const reportCreatedAt = reportCurrent.ok
      ? ((frontMatterString(
          reportCurrent.value.document,
          "created_at",
        ) as UtcIsoTimestamp | null) ?? snapshot.snapshot_at)
      : snapshot.snapshot_at;
    const reportRevision = reportCurrent.ok
      ? reportCurrent.value.version.revision + 1
      : 1;
    const report = await repository.write(
      reportRelativePath,
      historicalReportDocument(
        inventory,
        reportId,
        now,
        reportRevision,
        reportCreatedAt,
        metadata,
      ),
      reportCurrent.ok ? reportCurrent.value.version : null,
    );
    if (!report.ok)
      return failure(
        "write_failed",
        report.error.message,
        report.error.details,
      );
    (reportCurrent.ok ? rebuiltFiles : createdFiles).push(reportRelativePath);

    return {
      ok: true,
      value: {
        inventory,
        createdFiles,
        rebuiltFiles,
        reportRelativePath,
        manifestRelativePath: dogfoodingManifestPath,
      },
    };
  }

  private async writeIfMissing(
    repository: GovernanceRepository,
    relativePath: string,
    document: GovernanceDocument,
  ): Promise<DogfoodingResult<boolean>> {
    const current = await repository.read(relativePath);
    if (current.ok) return { ok: true, value: false };
    if (current.error.code !== "not_found")
      return failure(
        "write_failed",
        current.error.message,
        current.error.details,
      );
    const written = await repository.write(relativePath, document, null);
    if (!written.ok)
      return failure(
        "write_failed",
        written.error.message,
        written.error.details,
      );
    return { ok: true, value: true };
  }

  private async writeHistoricalGenerated(
    repository: GovernanceRepository,
    relativePath: string,
    document: GovernanceDocument,
  ): Promise<DogfoodingResult<"created" | "rebuilt">> {
    const current = await repository.read(relativePath);
    if (!current.ok && current.error.code !== "not_found")
      return failure(
        "write_failed",
        current.error.message,
        current.error.details,
      );
    if (!current.ok) {
      const written = await repository.write(relativePath, document, null);
      if (!written.ok)
        return failure(
          "write_failed",
          written.error.message,
          written.error.details,
        );
      return { ok: true, value: "created" };
    }
    const next = await repository.write(
      relativePath,
      {
        frontMatter: {
          ...document.frontMatter,
          revision: current.value.version.revision + 1,
        },
        body: document.body,
      },
      current.value.version,
    );
    if (!next.ok)
      return failure("write_failed", next.error.message, next.error.details);
    return { ok: true, value: "rebuilt" };
  }
}

export function relativeProjectPath(
  projectRoot: string,
  absolutePath: string,
): string {
  return relative(resolve(projectRoot), resolve(absolutePath)).replaceAll(
    "\\",
    "/",
  );
}
