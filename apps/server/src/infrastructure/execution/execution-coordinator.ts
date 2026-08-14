import { resolve } from "node:path";

import type {
  AgentEvent,
  AgentResult,
  AgentRuntime,
  AgentSession,
  AgentStartRequest,
  ExecutionId,
  GoalId,
  TaskId,
  UtcIsoTimestamp,
} from "@personal-ai-operator/contracts";
import type { Goal, Task, TaskStatus } from "@personal-ai-operator/domain";

import {
  FakeAgentAdapter,
  type FakeAgentScenario,
} from "../agent-runtime/fake-agent-adapter.js";
import { GoalService, type GoalSnapshot } from "../goals/goal-service.js";
import { IssueService, type IssuePage } from "../issues/issue-service.js";
import {
  TaskService,
  type TaskPage,
  type TaskSnapshot,
} from "../tasks/task-service.js";
import {
  FileExecutionRecoveryRepository,
  type ExecutionRecoveryRecord,
  type ExecutionRecoveryRepository,
} from "./execution-recovery-repository.js";

export type ExecutionRunStatus =
  | "running"
  | "completed"
  | "failed"
  | "interrupted"
  | "privilege_violation"
  | "review_failed"
  | "invalid_output";

export type ExecutionRun = Readonly<{
  readonly executionId: ExecutionId;
  readonly projectKey: string;
  readonly taskId: TaskId;
  readonly goalId: GoalId;
  readonly role: string;
  readonly status: ExecutionRunStatus;
  readonly taskStatus: TaskStatus;
  readonly startedAt: UtcIsoTimestamp;
  readonly completedAt: UtcIsoTimestamp | null;
  readonly events: readonly AgentEvent[];
  readonly result: AgentResult | null;
  readonly recovery: ExecutionRecoveryReport | null;
}>;

export type ExecutionRecoveryReport = Readonly<{
  readonly required: true;
  readonly executionId: ExecutionId;
  readonly taskId: TaskId;
  readonly sessionId: string | null;
  readonly reason: string;
  readonly choices: readonly ["resume", "retry", "cancel"];
}>;

export type ExecutionState = Readonly<{
  readonly active: boolean;
  readonly run: ExecutionRun | null;
  readonly recovery: ExecutionRecoveryReport | null;
}>;

export type ExecutionStartResult = Readonly<{
  readonly projectKey: string;
  readonly task: TaskSnapshot;
  readonly run: ExecutionRun;
}>;

export type ExecutionControlResult = Readonly<{
  readonly projectKey: string;
  readonly run: ExecutionRun;
}>;

export type ExecutionCoordinatorErrorCode =
  | "invalid_input"
  | "registry_failed"
  | "project_not_found"
  | "goal_not_found"
  | "goal_not_approved"
  | "task_not_found"
  | "task_not_ready"
  | "dependency_not_ready"
  | "issue_blocked"
  | "decision_required"
  | "recovery_required"
  | "no_ready_task"
  | "execution_active"
  | "execution_not_found"
  | "not_resumable"
  | "runtime_failed"
  | "transition_failed";

export type ExecutionCoordinatorError = Readonly<{
  readonly code: ExecutionCoordinatorErrorCode;
  readonly message: string;
  readonly details: readonly string[];
}>;

export type ExecutionCoordinatorResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: ExecutionCoordinatorError }>;

export type ExecutionCoordinatorOptions = Readonly<{
  readonly runtime?: AgentRuntime;
  readonly taskService?: TaskService;
  readonly goalService?: GoalService;
  readonly issueService?: IssueService;
  readonly now?: () => UtcIsoTimestamp;
  readonly lock?: ExecutionLock;
  readonly recoveryRepository?: ExecutionRecoveryRepository;
}>;

type LockOwner = Readonly<{
  readonly token: string;
  readonly projectKey: string;
  readonly taskId: TaskId | null;
  readonly executionId: ExecutionId | null;
}>;

export class ExecutionLock {
  private owner: LockOwner | null = null;
  private nextToken = 1;

  public acquire(projectKey: string, taskId: TaskId | null): string | null {
    if (this.owner !== null) return null;
    const token = `LOCK-${this.nextToken}`;
    this.nextToken += 1;
    this.owner = { token, projectKey, taskId, executionId: null };
    return token;
  }

  public assignExecution(token: string, executionId: ExecutionId): void {
    if (this.owner?.token === token) {
      this.owner = { ...this.owner, executionId };
    }
  }

  public release(token: string): void {
    if (this.owner?.token === token) this.owner = null;
  }

  public snapshot(): LockOwner | null {
    return this.owner;
  }
}

const sharedExecutionLock = new ExecutionLock();

type InternalRun = {
  state: ExecutionRun;
  session: AgentSession;
  readonly task: Task;
  readonly goal: Goal;
  readonly projectRoot: string;
  lockToken: string;
};

type Candidate = Readonly<{
  readonly task: TaskSnapshot;
  readonly goal: GoalSnapshot;
  readonly issues: IssuePage;
}>;

function failure<Value>(
  code: ExecutionCoordinatorErrorCode,
  message: string,
  details: readonly string[] = [],
): ExecutionCoordinatorResult<Value> {
  return { ok: false, error: { code, message, details } };
}

function nowUtc(): UtcIsoTimestamp {
  return new Date().toISOString() as UtcIsoTimestamp;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function taskId(value: unknown): TaskId | null {
  return typeof value === "string" && /^TASK-(?!000)\d{3}$/.test(value)
    ? (value as TaskId)
    : null;
}

function executionId(value: unknown): ExecutionId | null {
  return typeof value === "string" && /^EXEC-(?!000)\d{3}$/.test(value)
    ? (value as ExecutionId)
    : null;
}

async function collectEvents(
  events: AsyncIterable<AgentEvent>,
): Promise<AgentEvent[]> {
  const collected: AgentEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

function taskPrompt(task: Task, requested: unknown): string {
  if (typeof requested === "string" && requested.trim().length > 0) {
    return requested.trim();
  }
  return [
    `Execute ${task.id}: ${task.title}`,
    `Purpose: ${task.purpose}`,
    `Scope: ${task.scope.join(", ")}`,
    `Acceptance: ${task.acceptanceCriteria.join("; ")}`,
  ].join("\n");
}

function isBlockingIssue(
  issue: IssuePage["issues"][number]["issue"],
  task: Task,
): boolean {
  if (issue.status !== "in_progress") return false;
  if (issue.severity === "blocker") return true;
  if (issue.impact === "unknown" || issue.impact === "execution_chain") {
    return true;
  }
  if (issue.impact === "task") return issue.affectedTaskIds.includes(task.id);
  return issue.affectedObjectIds.includes(task.goalId);
}

function decisionBlocks(
  decision: IssuePage["decisions"][number]["decision"],
  blockingIssueIds: readonly string[],
  task: Task,
): boolean {
  if (decision.status !== "draft") return false;
  return (
    (decision.sourceIssueId !== null &&
      blockingIssueIds.includes(decision.sourceIssueId)) ||
    decision.relatedObjectIds.includes(task.id) ||
    decision.relatedObjectIds.includes(task.goalId)
  );
}

function resultTaskStatus(result: AgentResult): Readonly<{
  readonly status: Extract<TaskStatus, "in_review" | "blocked" | "paused">;
  readonly reason: string;
}> {
  switch (result.status) {
    case "completed":
      return {
        status: "in_review",
        reason:
          "Agent execution produced a result; reviewer acceptance is required.",
      };
    case "interrupted":
    case "privilege_violation":
      return {
        status: "paused",
        reason: `Agent execution ended with ${result.status}; recovery is required.`,
      };
    default:
      return {
        status: "blocked",
        reason: `Agent execution ended with ${result.status}; inspect the result before retrying.`,
      };
  }
}

function recoveryReport(
  executionId: ExecutionId,
  taskId: TaskId,
  sessionId: string | null,
  reason: string,
): ExecutionRecoveryReport {
  return {
    required: true,
    executionId,
    taskId,
    sessionId,
    reason,
    choices: ["resume", "retry", "cancel"],
  };
}

function recoveryRecord(
  run: InternalRun,
  result: AgentResult,
  interruptedAt: UtcIsoTimestamp,
): ExecutionRecoveryRecord {
  return {
    schemaVersion: 1,
    projectKey: run.state.projectKey,
    executionId: run.state.executionId,
    taskId: run.state.taskId,
    goalId: run.state.goalId,
    role: run.state.role,
    sessionId:
      run.session.sessionId ??
      (typeof result.output?.threadId === "string"
        ? result.output.threadId
        : null),
    startedAt: run.state.startedAt,
    interruptedAt,
    reason:
      result.error?.message ??
      "The Agent execution was interrupted and requires a user recovery choice.",
  };
}

function pendingRecoveryRecord(
  run: InternalRun,
  at: UtcIsoTimestamp,
): ExecutionRecoveryRecord {
  return {
    schemaVersion: 1,
    projectKey: run.state.projectKey,
    executionId: run.state.executionId,
    taskId: run.state.taskId,
    goalId: run.state.goalId,
    role: run.state.role,
    sessionId: run.session.sessionId,
    startedAt: run.state.startedAt,
    interruptedAt: at,
    reason:
      "Execution is active; recovery information is reserved until it ends.",
  };
}

function recoveryExecutionRun(
  record: ExecutionRecoveryRecord,
  taskStatus: TaskStatus,
): ExecutionRun {
  const recovery = recoveryReport(
    record.executionId,
    record.taskId,
    record.sessionId,
    record.reason,
  );
  return {
    executionId: record.executionId,
    projectKey: record.projectKey,
    taskId: record.taskId,
    goalId: record.goalId,
    role: record.role,
    status: "interrupted",
    taskStatus,
    startedAt: record.startedAt,
    completedAt: record.interruptedAt,
    events: [],
    result: {
      executionId: record.executionId,
      status: "interrupted",
      output: { sessionId: record.sessionId },
      error: { code: "interrupted", message: record.reason },
      diagnostics: ["Execution recovery is waiting for a user choice."],
    },
    recovery,
  };
}

export class ExecutionCoordinatorService {
  private readonly runtime: AgentRuntime;
  private readonly taskService: TaskService;
  private readonly goalService: GoalService;
  private readonly issueService: IssueService;
  private readonly now: () => UtcIsoTimestamp;
  private readonly lock: ExecutionLock;
  private readonly recoveryRepository: ExecutionRecoveryRepository;
  private readonly runs = new Map<ExecutionId, InternalRun>();

  public constructor(options: ExecutionCoordinatorOptions = {}) {
    this.runtime = options.runtime ?? new FakeAgentAdapter();
    this.taskService = options.taskService ?? new TaskService();
    this.goalService = options.goalService ?? new GoalService();
    this.issueService = options.issueService ?? new IssueService();
    this.now = options.now ?? nowUtc;
    this.lock = options.lock ?? sharedExecutionLock;
    this.recoveryRepository =
      options.recoveryRepository ?? new FileExecutionRecoveryRepository();
  }

  public async getState(
    projectKey: string,
  ): Promise<ExecutionCoordinatorResult<ExecutionState>> {
    if (projectKey.trim().length === 0)
      return failure("invalid_input", "A projectKey is required.");
    const tasks = await this.taskService.getTasks(projectKey);
    if (!tasks.ok) {
      return failure(
        "runtime_failed",
        tasks.error.message,
        tasks.error.details,
      );
    }
    const records = await this.reconcileRecovery(tasks.value);
    const owner = this.lock.snapshot();
    const activeRun =
      owner?.projectKey === projectKey && owner.executionId !== null
        ? this.runs.get(owner.executionId)
        : undefined;
    if (activeRun !== undefined) {
      return {
        ok: true,
        value: {
          active: true,
          run: activeRun.state,
          recovery: activeRun.state.recovery,
        },
      };
    }
    const latest = [...this.runs.values()]
      .filter((run) => run.state.projectKey === projectKey)
      .sort((left, right) =>
        left.state.startedAt.localeCompare(right.state.startedAt),
      )
      .at(-1);
    if (latest !== undefined) {
      return {
        ok: true,
        value: {
          active: false,
          run: latest.state,
          recovery: latest.state.recovery,
        },
      };
    }
    const record = records.at(-1);
    if (record === undefined) {
      return { ok: true, value: { active: false, run: null, recovery: null } };
    }
    const task = tasks.value.tasks.find(
      (item) => item.task.id === record.taskId,
    );
    if (task === undefined) {
      return { ok: true, value: { active: false, run: null, recovery: null } };
    }
    const recovery = recoveryReport(
      record.executionId,
      record.taskId,
      record.sessionId,
      record.reason,
    );
    const run: ExecutionRun = {
      executionId: record.executionId,
      projectKey,
      taskId: record.taskId,
      goalId: record.goalId,
      role: record.role,
      status: "interrupted",
      taskStatus: task.task.status,
      startedAt: record.startedAt,
      completedAt: record.interruptedAt,
      events: [],
      result: {
        executionId: record.executionId,
        status: "interrupted",
        output: { sessionId: record.sessionId },
        error: { code: "interrupted", message: record.reason },
        diagnostics: ["Execution recovery is waiting for a user choice."],
      },
      recovery,
    };
    return { ok: true, value: { active: false, run, recovery } };
  }

  public async start(
    input: unknown,
    scenario?: FakeAgentScenario,
  ): Promise<ExecutionCoordinatorResult<ExecutionStartResult>> {
    if (!isRecord(input) || typeof input.projectKey !== "string")
      return failure("invalid_input", "A projectKey is required.");
    const requestedTaskId =
      input.taskId === undefined ? null : taskId(input.taskId);
    if (input.taskId !== undefined && requestedTaskId === null)
      return failure("invalid_input", "taskId must be a TASK-### identifier.");
    const token = this.lock.acquire(input.projectKey, requestedTaskId);
    if (token === null)
      return failure(
        "execution_active",
        "Another project or task execution chain is already active.",
      );
    try {
      const candidate = await this.selectCandidate(
        input.projectKey,
        requestedTaskId,
      );
      if (!candidate.ok) return candidate;
      const started = await this.transition(
        input.projectKey,
        candidate.value.task,
        "in_progress",
        "Execution coordinator started the task.",
      );
      if (!started.ok) return started;
      const request = this.agentRequest(candidate.value, input);
      let session: AgentSession;
      try {
        session =
          scenario !== undefined && this.runtime instanceof FakeAgentAdapter
            ? await this.runtime.start(request, scenario)
            : await this.runtime.start(request);
      } catch (error) {
        await this.transitionCurrent(
          input.projectKey,
          candidate.value.task.task.id,
          "blocked",
          `Agent runtime could not start: ${error instanceof Error ? error.message : String(error)}`,
        );
        return failure("runtime_failed", "Agent runtime could not start.", [
          error instanceof Error ? error.message : String(error),
        ]);
      }
      this.lock.assignExecution(token, session.executionId);
      const run: InternalRun = {
        state: {
          executionId: session.executionId,
          projectKey: input.projectKey,
          taskId: candidate.value.task.task.id,
          goalId: candidate.value.task.task.goalId,
          role: candidate.value.task.task.currentRole,
          status: "running",
          taskStatus: started.value.task.status,
          startedAt: this.now(),
          completedAt: null,
          events: [],
          result: null,
          recovery: null,
        },
        session,
        task: started.value.task,
        goal: candidate.value.goal.goal,
        projectRoot: candidate.value.issues.projectRoot,
        lockToken: token,
      };
      this.runs.set(session.executionId, run);
      await this.recoveryRepository.upsert(
        run.projectRoot,
        pendingRecoveryRecord(run, this.now()),
      );
      return await this.finishRun(run);
    } finally {
      const owner = this.lock.snapshot();
      if (owner?.token === token && owner.executionId === null) {
        this.lock.release(token);
      }
    }
  }

  public async resume(
    input: unknown,
  ): Promise<ExecutionCoordinatorResult<ExecutionStartResult>> {
    if (
      !isRecord(input) ||
      typeof input.projectKey !== "string" ||
      executionId(input.executionId) === null
    )
      return failure(
        "invalid_input",
        "A projectKey and executionId are required.",
      );
    const id = input.executionId as ExecutionId;
    const tasks = await this.taskService.getTasks(input.projectKey);
    if (!tasks.ok) {
      return failure(
        "runtime_failed",
        tasks.error.message,
        tasks.error.details,
      );
    }
    const records = await this.reconcileRecovery(tasks.value);
    let existing = this.runs.get(id);
    const persisted = records.find((record) => record.executionId === id);
    const resumeTaskId = existing?.task.id ?? persisted?.taskId;
    if (resumeTaskId === undefined)
      return failure("execution_not_found", "Execution was not found.");
    if (existing !== undefined && existing.state.status !== "interrupted")
      return failure(
        "not_resumable",
        "Only an interrupted execution can be resumed.",
      );
    const token = this.lock.acquire(input.projectKey, resumeTaskId);
    if (token === null)
      return failure(
        "execution_active",
        "Another project or task execution chain is already active.",
      );
    try {
      const candidate = await this.selectCandidate(
        input.projectKey,
        resumeTaskId,
        true,
      );
      if (!candidate.ok) return candidate;
      const resumedTask = await this.transition(
        input.projectKey,
        candidate.value.task,
        "in_progress",
        "Execution coordinator resumed the interrupted task.",
      );
      if (!resumedTask.ok) return resumedTask;
      let session: AgentSession;
      try {
        const storedSessionId =
          persisted?.sessionId ?? existing?.session.sessionId;
        session =
          storedSessionId === undefined
            ? await this.runtime.resume({ executionId: id })
            : await this.runtime.resume({
                executionId: id,
                sessionId: storedSessionId,
              });
      } catch (error) {
        await this.transitionCurrent(
          input.projectKey,
          resumeTaskId,
          "paused",
          `Agent runtime could not resume: ${error instanceof Error ? error.message : String(error)}`,
        );
        return failure("runtime_failed", "Agent runtime could not resume.", [
          error instanceof Error ? error.message : String(error),
        ]);
      }
      this.lock.assignExecution(token, id);
      if (existing === undefined) {
        existing = {
          state: {
            executionId: id,
            projectKey: input.projectKey,
            taskId: resumedTask.value.task.id,
            goalId: resumedTask.value.task.goalId,
            role: resumedTask.value.task.currentRole,
            status: "running",
            taskStatus: resumedTask.value.task.status,
            startedAt: persisted?.startedAt ?? this.now(),
            completedAt: null,
            events: [],
            result: null,
            recovery: null,
          },
          session,
          task: resumedTask.value.task,
          goal: candidate.value.goal.goal,
          projectRoot: candidate.value.issues.projectRoot,
          lockToken: token,
        };
        this.runs.set(id, existing);
      } else {
        existing.session = session;
        existing.state = {
          ...existing.state,
          status: "running",
          taskStatus: resumedTask.value.task.status,
          completedAt: null,
          events: [],
          result: null,
          recovery: null,
        };
        existing.lockToken = token;
      }
      return await this.finishRun(existing);
    } finally {
      const owner = this.lock.snapshot();
      if (owner?.token === token && owner.executionId === null) {
        this.lock.release(token);
      }
    }
  }

  public async cancel(
    input: unknown,
  ): Promise<ExecutionCoordinatorResult<ExecutionControlResult>> {
    if (
      !isRecord(input) ||
      typeof input.projectKey !== "string" ||
      executionId(input.executionId) === null
    )
      return failure(
        "invalid_input",
        "A projectKey and executionId are required.",
      );
    const id = input.executionId as ExecutionId;
    const owner = this.lock.snapshot();
    const run = this.runs.get(id);
    if (
      run === undefined ||
      owner?.executionId !== id ||
      owner.projectKey !== input.projectKey
    ) {
      const tasks = await this.taskService.getTasks(input.projectKey);
      if (!tasks.ok) {
        return failure(
          "runtime_failed",
          tasks.error.message,
          tasks.error.details,
        );
      }
      const records = await this.reconcileRecovery(tasks.value);
      const record = records.find((item) => item.executionId === id);
      if (record === undefined) {
        return failure(
          "execution_not_found",
          "Active execution was not found.",
        );
      }
      const task = tasks.value.tasks.find(
        (item) => item.task.id === record.taskId,
      );
      if (task === undefined) {
        return failure("task_not_found", "The interrupted task was not found.");
      }
      const cancelled = await this.transition(
        input.projectKey,
        task,
        "cancelled",
        "User chose to cancel the interrupted execution.",
      );
      if (!cancelled.ok) return cancelled;
      await this.recoveryRepository.remove(tasks.value.projectRoot, id);
      return {
        ok: true,
        value: {
          projectKey: input.projectKey,
          run: {
            ...recoveryExecutionRun(record, cancelled.value.task.status),
            taskStatus: cancelled.value.task.status,
            recovery: null,
          },
        },
      };
    }
    const cancelled = await this.runtime.cancel({ executionId: id });
    if (!cancelled.ok)
      return failure("runtime_failed", cancelled.message, [cancelled.code]);
    return {
      ok: true,
      value: { projectKey: input.projectKey, run: run.state },
    };
  }

  public async retry(
    input: unknown,
  ): Promise<ExecutionCoordinatorResult<ExecutionStartResult>> {
    if (
      !isRecord(input) ||
      typeof input.projectKey !== "string" ||
      executionId(input.executionId) === null
    ) {
      return failure(
        "invalid_input",
        "A projectKey and executionId are required.",
      );
    }
    const id = input.executionId as ExecutionId;
    const tasks = await this.taskService.getTasks(input.projectKey);
    if (!tasks.ok) {
      return failure(
        "runtime_failed",
        tasks.error.message,
        tasks.error.details,
      );
    }
    const records = await this.reconcileRecovery(tasks.value);
    const existing = this.runs.get(id);
    const persisted = records.find((record) => record.executionId === id);
    const retryTaskId = existing?.task.id ?? persisted?.taskId;
    if (retryTaskId === undefined) {
      return failure("execution_not_found", "Execution was not found.");
    }
    const token = this.lock.acquire(input.projectKey, retryTaskId);
    if (token === null) {
      return failure(
        "execution_active",
        "Another project or task execution chain is already active.",
      );
    }
    try {
      const candidate = await this.selectCandidate(
        input.projectKey,
        retryTaskId,
        true,
      );
      if (!candidate.ok) return candidate;
      const started = await this.transition(
        input.projectKey,
        candidate.value.task,
        "in_progress",
        "User chose to retry the interrupted execution.",
      );
      if (!started.ok) return started;
      let session: AgentSession;
      try {
        session = await this.runtime.start(
          this.agentRequest(candidate.value, input),
        );
      } catch (error) {
        await this.transitionCurrent(
          input.projectKey,
          retryTaskId,
          "paused",
          `Agent runtime could not restart: ${error instanceof Error ? error.message : String(error)}`,
        );
        return failure("runtime_failed", "Agent runtime could not restart.", [
          error instanceof Error ? error.message : String(error),
        ]);
      }
      this.lock.assignExecution(token, session.executionId);
      const run: InternalRun = {
        state: {
          executionId: session.executionId,
          projectKey: input.projectKey,
          taskId: started.value.task.id,
          goalId: started.value.task.goalId,
          role: started.value.task.currentRole,
          status: "running",
          taskStatus: started.value.task.status,
          startedAt: this.now(),
          completedAt: null,
          events: [],
          result: null,
          recovery: null,
        },
        session,
        task: started.value.task,
        goal: candidate.value.goal.goal,
        projectRoot: candidate.value.issues.projectRoot,
        lockToken: token,
      };
      this.runs.set(session.executionId, run);
      await this.recoveryRepository.remove(run.projectRoot, id);
      await this.recoveryRepository.upsert(
        run.projectRoot,
        pendingRecoveryRecord(run, this.now()),
      );
      return await this.finishRun(run);
    } finally {
      const owner = this.lock.snapshot();
      if (owner?.token === token && owner.executionId === null) {
        this.lock.release(token);
      }
    }
  }

  public async shutdown(): Promise<void> {
    const runtime = this.runtime as AgentRuntime & {
      readonly shutdown?: () => Promise<void>;
    };
    await runtime.shutdown?.();
  }

  private async reconcileRecovery(
    tasks: TaskPage,
  ): Promise<readonly ExecutionRecoveryRecord[]> {
    const records = await this.recoveryRepository.read(tasks.projectRoot);
    for (const record of records) {
      if (this.runs.has(record.executionId)) continue;
      const task = tasks.tasks.find((item) => item.task.id === record.taskId);
      if (task === undefined || task.task.status !== "in_progress") continue;
      const reason =
        "The backend restarted while this execution was active; choose resume, retry, or cancel.";
      const transitioned = await this.taskService.transition({
        projectKey: tasks.projectKey,
        taskId: task.task.id,
        toStatus: "paused",
        reason,
        revision: task.revision,
        hash: task.hash,
      });
      if (transitioned.ok) {
        await this.recoveryRepository.upsert(tasks.projectRoot, {
          ...record,
          interruptedAt: this.now(),
          reason,
        });
      }
    }
    return this.recoveryRepository.read(tasks.projectRoot);
  }

  private async selectCandidate(
    projectKey: string,
    requestedTaskId: TaskId | null,
    recovery = false,
  ): Promise<ExecutionCoordinatorResult<Candidate>> {
    const tasks = await this.taskService.getTasks(projectKey);
    if (!tasks.ok)
      return failure(
        tasks.error.code === "registry_failed"
          ? "registry_failed"
          : tasks.error.code === "project_not_found"
            ? "project_not_found"
            : "runtime_failed",
        tasks.error.message,
        tasks.error.details,
      );
    const recoveryRecords = await this.reconcileRecovery(tasks.value);
    if (!recovery && recoveryRecords.length > 0) {
      return failure(
        "recovery_required",
        "An interrupted execution must be recovered before another task can start.",
        recoveryRecords.map((record) => record.executionId),
      );
    }
    if (
      !recovery &&
      tasks.value.tasks.some((item) => item.task.status === "in_progress")
    ) {
      return failure(
        "recovery_required",
        "An interrupted execution must be recovered before another task can start.",
        tasks.value.tasks
          .filter((item) => item.task.status === "in_progress")
          .map((item) => item.task.id),
      );
    }
    const goals = await this.goalService.getGoals(projectKey);
    if (!goals.ok)
      return failure(
        goals.error.code === "registry_failed"
          ? "registry_failed"
          : goals.error.code === "project_not_found"
            ? "project_not_found"
            : "runtime_failed",
        goals.error.message,
        goals.error.details,
      );
    const issues = await this.issueService.getIssues(projectKey);
    if (!issues.ok)
      return failure(
        issues.error.code === "registry_failed"
          ? "registry_failed"
          : issues.error.code === "project_not_found"
            ? "project_not_found"
            : "runtime_failed",
        issues.error.message,
        issues.error.details,
      );
    const candidates = requestedTaskId
      ? tasks.value.tasks.filter((item) => item.task.id === requestedTaskId)
      : tasks.value.tasks.filter((item) => item.task.status === "ready");
    if (candidates.length === 0)
      return failure(
        requestedTaskId === null ? "no_ready_task" : "task_not_found",
        requestedTaskId === null
          ? "No ready task is available for execution."
          : "Task was not found.",
      );
    let lastFailure: ExecutionCoordinatorResult<Candidate> | null = null;
    for (const task of candidates) {
      const goal = goals.value.goals.find(
        (item) => item.goal.id === task.task.goalId,
      );
      if (goal === undefined) {
        lastFailure = failure("goal_not_found", "Task goal was not found.");
        continue;
      }
      const checked = this.checkCandidate(
        task,
        goal,
        tasks.value,
        issues.value,
        recovery,
      );
      if (checked.ok)
        return { ok: true, value: { task, goal, issues: issues.value } };
      lastFailure = checked;
      if (requestedTaskId !== null) return checked;
    }
    return (
      lastFailure ??
      failure("no_ready_task", "No task satisfies the execution conditions.")
    );
  }

  private checkCandidate(
    task: TaskSnapshot,
    goal: GoalSnapshot,
    allTasks: TaskPage,
    issues: IssuePage,
    recovery: boolean,
  ): ExecutionCoordinatorResult<Candidate> {
    if (goal.goal.approval?.approved !== true)
      return failure(
        "goal_not_approved",
        "An unapproved goal cannot start an execution chain.",
      );
    if (goal.goal.status !== "ready" && goal.goal.status !== "in_progress")
      return failure(
        "goal_not_approved",
        "Only a ready or in-progress approved goal can execute.",
      );
    if (recovery) {
      if (task.task.status !== "paused")
        return failure(
          "not_resumable",
          "Only a paused task can resume an interrupted execution.",
        );
    } else if (task.task.status !== "ready") {
      return failure(
        task.task.status === "in_progress"
          ? "recovery_required"
          : "task_not_ready",
        task.task.status === "in_progress"
          ? "The in-progress task requires an existing interrupted execution to recover."
          : `Task is ${task.task.status}; only ready tasks can start.`,
      );
    }
    const taskMap = new Map(
      allTasks.tasks.map((item) => [item.task.id, item.task]),
    );
    const incomplete = task.task.dependencies.filter(
      (dependency) => taskMap.get(dependency)?.status !== "completed",
    );
    if (incomplete.length > 0)
      return failure(
        "dependency_not_ready",
        "Task dependencies must be completed before execution.",
        incomplete,
      );
    const blockingIssues = issues.issues.filter((item) =>
      isBlockingIssue(item.issue, task.task),
    );
    if (blockingIssues.length > 0)
      return failure(
        "issue_blocked",
        "An open issue pauses the affected execution scope.",
        blockingIssues.map((item) => item.issue.id),
      );
    const blockingIssueIds = blockingIssues.map((item) => item.issue.id);
    const pendingDecisions = issues.decisions.filter((item) =>
      decisionBlocks(item.decision, blockingIssueIds, task.task),
    );
    if (pendingDecisions.length > 0)
      return failure(
        "decision_required",
        "A user decision is required before this execution can start.",
        pendingDecisions.map((item) => item.decision.id),
      );
    return { ok: true, value: { task, goal, issues } };
  }

  private agentRequest(
    candidate: Candidate,
    input: Record<string, unknown>,
  ): AgentStartRequest {
    const task = candidate.task.task;
    return {
      taskId: task.id,
      goalId: task.goalId,
      role: task.currentRole,
      prompt: taskPrompt(task, input.prompt),
      workingDirectory: resolve(
        candidate.issues.projectRoot,
        task.run.worktree,
      ),
      allowedPaths: task.allowedPaths,
      forbiddenPaths: task.forbiddenPaths,
      context: [
        { key: "task_id", value: task.id },
        { key: "task_title", value: task.title },
        { key: "goal_id", value: task.goalId },
        { key: "role", value: task.currentRole },
      ],
    };
  }

  private async transition(
    projectKey: string,
    snapshot: TaskSnapshot,
    toStatus: TaskStatus,
    reason: string,
  ): Promise<ExecutionCoordinatorResult<TaskSnapshot>> {
    const result = await this.taskService.transition({
      projectKey,
      taskId: snapshot.task.id,
      toStatus,
      reason,
      revision: snapshot.revision,
      hash: snapshot.hash,
    });
    return result.ok
      ? { ok: true, value: result.value }
      : failure(
          "transition_failed",
          result.error.message,
          result.error.details,
        );
  }

  private async transitionCurrent(
    projectKey: string,
    taskIdValue: TaskId,
    toStatus: TaskStatus,
    reason: string,
  ): Promise<void> {
    const tasks = await this.taskService.getTasks(projectKey);
    if (!tasks.ok) return;
    const current = tasks.value.tasks.find(
      (item) => item.task.id === taskIdValue,
    );
    if (current === undefined) return;
    await this.taskService.transition({
      projectKey,
      taskId: taskIdValue,
      toStatus,
      reason,
      revision: current.revision,
      hash: current.hash,
    });
  }

  private async finishRun(
    run: InternalRun,
  ): Promise<ExecutionCoordinatorResult<ExecutionStartResult>> {
    try {
      const events = await collectEvents(run.session.events);
      const result = await run.session.result;
      const next = resultTaskStatus(result);
      const tasks = await this.taskService.getTasks(run.state.projectKey);
      if (!tasks.ok)
        return failure(
          "runtime_failed",
          tasks.error.message,
          tasks.error.details,
        );
      const current = tasks.value.tasks.find(
        (item) => item.task.id === run.state.taskId,
      );
      if (current === undefined)
        return failure("task_not_found", "Task disappeared during execution.");
      const transitioned = await this.taskService.transition({
        projectKey: run.state.projectKey,
        taskId: run.state.taskId,
        toStatus: next.status,
        reason: next.reason,
        revision: current.revision,
        hash: current.hash,
      });
      if (!transitioned.ok)
        return failure(
          "transition_failed",
          transitioned.error.message,
          transitioned.error.details,
        );
      run.state = {
        ...run.state,
        status: result.status,
        taskStatus: transitioned.value.task.status,
        completedAt: this.now(),
        events,
        result,
        recovery:
          result.status === "interrupted"
            ? recoveryReport(
                run.state.executionId,
                run.state.taskId,
                run.session.sessionId ??
                  (typeof result.output?.threadId === "string"
                    ? result.output.threadId
                    : null),
                result.error?.message ??
                  "The Agent execution was interrupted and requires a user recovery choice.",
              )
            : null,
      };
      if (result.status === "interrupted") {
        await this.recoveryRepository.upsert(
          run.projectRoot,
          recoveryRecord(run, result, run.state.completedAt ?? this.now()),
        );
      } else {
        await this.recoveryRepository.remove(
          run.projectRoot,
          run.state.executionId,
        );
      }
      return {
        ok: true,
        value: {
          projectKey: run.state.projectKey,
          task: transitioned.value,
          run: run.state,
        },
      };
    } catch (error) {
      return failure(
        "runtime_failed",
        "Agent execution could not be collected.",
        [error instanceof Error ? error.message : String(error)],
      );
    } finally {
      this.lock.release(run.lockToken);
    }
  }
}
