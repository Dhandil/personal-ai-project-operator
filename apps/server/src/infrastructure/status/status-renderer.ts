import type {
  Approval,
  Decision,
  Goal,
  Handoff,
  Issue,
  Project,
  Task,
} from "@personal-ai-operator/domain";
import type {
  FormalId,
  RecordStatus,
  ReportId,
  UtcIsoTimestamp,
} from "@personal-ai-operator/contracts";

import type {
  FrontMatterRecord,
  GovernanceDocument,
} from "../files/governance-codec.js";

export type StatusReportFact = Readonly<{
  readonly id: ReportId;
  readonly status: RecordStatus;
  readonly title: string;
  readonly summary: string;
  readonly relatedObjectIds: readonly FormalId[];
  readonly updatedAt: UtcIsoTimestamp;
}>;

export type StatusProjectionFacts = Readonly<{
  readonly project: Project;
  readonly goals: readonly Goal[];
  readonly tasks: readonly Task[];
  readonly approvals: readonly Approval[];
  readonly issues: readonly Issue[];
  readonly decisions: readonly Decision[];
  readonly handoffs: readonly Handoff[];
  readonly reports: readonly StatusReportFact[];
}>;

function byId<Value extends { readonly id: string }>(
  left: Value,
  right: Value,
): number {
  return left.id.localeCompare(right.id);
}

function oneLine(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ");
}

function formatId(id: string): string {
  return `\`${id}\``;
}

function formatList(values: readonly string[], empty = "无"): string {
  return values.length === 0
    ? `- ${empty}`
    : values.map((value) => `- ${value}`).join("\n");
}

function goalPriority(goal: Goal): number {
  if (goal.status === "in_progress") {
    return 0;
  }
  if (goal.status === "ready") {
    return 1;
  }
  return 2;
}

function taskPriority(task: Task): number {
  switch (task.status) {
    case "in_progress":
      return 0;
    case "in_review":
      return 1;
    case "blocked":
      return 2;
    case "changes_requested":
      return 3;
    case "ready":
      return 4;
    default:
      return 5;
  }
}

function approvedGoals(facts: StatusProjectionFacts): readonly Goal[] {
  return facts.goals
    .filter(
      (goal) =>
        goal.approval?.approved === true &&
        (goal.status === "ready" || goal.status === "in_progress"),
    )
    .toSorted(
      (left, right) =>
        goalPriority(left) - goalPriority(right) || byId(left, right),
    );
}

function currentTasks(
  facts: StatusProjectionFacts,
  activeGoalIds: ReadonlySet<string>,
): readonly Task[] {
  return facts.tasks
    .filter(
      (task) =>
        activeGoalIds.has(task.goalId) &&
        task.status !== "draft" &&
        task.status !== "completed" &&
        task.status !== "cancelled",
    )
    .toSorted(
      (left, right) =>
        taskPriority(left) - taskPriority(right) || byId(left, right),
    );
}

function taskSummary(task: Task): string {
  return `${formatId(task.id)} ${oneLine(task.title)} — ${task.status} — 责任角色：${task.currentRole}`;
}

function approvalSummary(approval: Approval): string {
  return `${formatId(approval.id)} ${approval.approvalType} — 对象 ${formatId(approval.subjectId)} — 待用户处理`;
}

function issueSummary(issue: Issue): string {
  return `${formatId(issue.id)} ${oneLine(issue.title)} — ${issue.severity}/${issue.impact} — ${issue.status}`;
}

function decisionSummary(decision: Decision): string {
  return `${formatId(decision.id)} ${oneLine(decision.question)} — 待用户决定`;
}

function recommendation(
  activeGoals: readonly Goal[],
  tasks: readonly Task[],
  openIssues: readonly Issue[],
): string {
  const current = tasks[0];
  if (current !== undefined) {
    if (current.status === "blocked") {
      return `先处理 ${formatId(current.id)} 的阻塞问题，再恢复执行。`;
    }
    if (current.status === "changes_requested") {
      return `按审核意见修正 ${formatId(current.id)}，完成后重新提交审核。`;
    }
    if (current.status === "in_review") {
      return `继续审核 ${formatId(current.id)}，不要跳过验收证据。`;
    }
    return `继续执行 ${formatId(current.id)}，严格遵守其范围和验证命令。`;
  }

  const nextReadyTask = tasks.find((task) => task.status === "ready");
  if (nextReadyTask !== undefined) {
    return `启动已就绪任务 ${formatId(nextReadyTask.id)}。`;
  }
  if (openIssues.some((issue) => issue.severity === "blocker")) {
    return "先处理阻塞级问题并记录恢复方式。";
  }
  const goal = activeGoals[0];
  if (goal?.status === "ready") {
    return `启动已获批短期目标 ${formatId(goal.id)}。`;
  }
  if (goal !== undefined) {
    return `为 ${formatId(goal.id)} 准备下一张任务卡。`;
  }
  return "根据项目事实决定下一步，不从此快照反向创建状态。";
}

export function renderStatusDocument(
  facts: StatusProjectionFacts,
  generatedAt: UtcIsoTimestamp,
  revision: number,
): GovernanceDocument {
  const activeGoals = approvedGoals(facts);
  const activeGoalIds = new Set(activeGoals.map((goal) => goal.id));
  const tasks = currentTasks(facts, activeGoalIds);
  const completedTasks = facts.tasks
    .filter((task) => task.status === "completed")
    .toSorted(byId);
  const openIssues = facts.issues
    .filter(
      (issue) => issue.status !== "completed" && issue.status !== "cancelled",
    )
    .toSorted(byId);
  const pendingApprovals = facts.approvals
    .filter((approval) => approval.status === "draft")
    .toSorted(byId);
  const pendingDecisions = facts.decisions
    .filter((decision) => decision.status === "draft")
    .toSorted(byId);
  const activeHandoffs = facts.handoffs
    .filter((handoff) => handoff.status !== "completed")
    .toSorted(byId);
  const completedReports = facts.reports
    .filter((report) => report.status === "completed")
    .toSorted(byId);
  const risks = activeGoals.flatMap((goal) =>
    goal.risks.map((risk) => `${formatId(goal.id)} ${oneLine(risk)}`),
  );
  const userActions = [
    ...pendingApprovals.map(approvalSummary),
    ...pendingDecisions.map(decisionSummary),
    ...openIssues
      .filter((issue) => issue.severity === "blocker")
      .map((issue) => `${formatId(issue.id)} 需要先处理阻塞问题`),
  ];
  const lastCompleted = completedTasks.at(-1);
  const body = [
    "# 项目状态",
    "",
    `- 项目：${oneLine(facts.project.name)}`,
    `- 项目想法：${oneLine(facts.project.idea)}`,
    `- 当前工作流阶段：${facts.project.workflow.currentStage ?? "无"}`,
    "- 本文件由项目领域事实自动生成，不是独立事实源。",
    "",
    "## 当前获批短期目标",
    formatList(
      activeGoals.map(
        (goal) =>
          `${formatId(goal.id)} ${oneLine(goal.title)} — ${goal.status} — 验收条件 ${goal.acceptanceCriteria.length} 项`,
      ),
    ),
    "",
    "## 已完成成果",
    formatList([
      ...completedTasks.map(
        (task) => `${formatId(task.id)} ${oneLine(task.title)} — completed`,
      ),
      ...completedReports.map(
        (report) =>
          `${formatId(report.id)} ${oneLine(report.title)} — ${oneLine(report.summary)}`,
      ),
    ]),
    "",
    "## 当前任务",
    formatList(tasks.map(taskSummary)),
    "",
    "## Blocker、风险和待决策事项",
    formatList([
      ...openIssues.map(issueSummary),
      ...risks.map((risk) => `风险：${risk}`),
      ...pendingDecisions.map(decisionSummary),
    ]),
    "",
    "## 上一步",
    lastCompleted === undefined
      ? "- 尚无已完成任务。"
      : `- ${formatId(lastCompleted.id)} ${oneLine(lastCompleted.title)} 已完成。`,
    "",
    "## 推荐下一步",
    `- ${recommendation(activeGoals, tasks, openIssues)}`,
    "",
    "## 用户待办",
    formatList(userActions),
    "",
    "## 交接",
    formatList(
      activeHandoffs.map(
        (handoff) =>
          `${formatId(handoff.id)} ${oneLine(handoff.summary)} — ${handoff.fromRole} → ${handoff.toRole}`,
      ),
    ),
  ].join("\n");

  const frontMatter: FrontMatterRecord = {
    schema_version: 1,
    document_type: "status_snapshot",
    revision,
    generated_at: generatedAt,
    updated_at: generatedAt,
    source: "domain_facts",
  };
  return { frontMatter, body: `${body}\n` };
}
