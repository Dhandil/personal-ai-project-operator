import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  ExecutionId,
  GoalId,
  TaskId,
  UtcIsoTimestamp,
} from "@personal-ai-operator/contracts";

import { writeFileAtomically } from "../files/atomic-file-writer.js";
import {
  sharedProjectWriteQueue,
  type ProjectWriteQueue,
} from "../files/project-write-queue.js";

export const executionRecoveryRelativePath =
  ".personal-workspace/executions/recovery.json";

export type ExecutionRecoveryRecord = Readonly<{
  readonly schemaVersion: 1;
  readonly projectKey: string;
  readonly executionId: ExecutionId;
  readonly taskId: TaskId;
  readonly goalId: GoalId;
  readonly role: string;
  readonly sessionId: string | null;
  readonly startedAt: UtcIsoTimestamp;
  readonly interruptedAt: UtcIsoTimestamp;
  readonly reason: string;
}>;

export interface ExecutionRecoveryRepository {
  read(projectRoot: string): Promise<readonly ExecutionRecoveryRecord[]>;
  upsert(projectRoot: string, record: ExecutionRecoveryRecord): Promise<void>;
  remove(projectRoot: string, executionId: ExecutionId): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecoveryRecord(value: unknown): value is ExecutionRecoveryRecord {
  if (!isRecord(value)) return false;
  return (
    value.schemaVersion === 1 &&
    typeof value.projectKey === "string" &&
    /^EXEC-(?!000)\d{3}$/.test(String(value.executionId)) &&
    /^TASK-(?!000)\d{3}$/.test(String(value.taskId)) &&
    /^GOAL-(?!000)\d{3}$/.test(String(value.goalId)) &&
    typeof value.role === "string" &&
    (value.sessionId === null || typeof value.sessionId === "string") &&
    typeof value.startedAt === "string" &&
    typeof value.interruptedAt === "string" &&
    typeof value.reason === "string" &&
    value.reason.trim().length > 0
  );
}

export class FileExecutionRecoveryRepository implements ExecutionRecoveryRepository {
  private readonly writeQueue: ProjectWriteQueue;

  public constructor(writeQueue: ProjectWriteQueue = sharedProjectWriteQueue) {
    this.writeQueue = writeQueue;
  }

  public async read(
    projectRoot: string,
  ): Promise<readonly ExecutionRecoveryRecord[]> {
    const filePath = resolve(projectRoot, executionRecoveryRelativePath);
    let content: string;
    try {
      content = await readFile(filePath, "utf8");
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return [];
      }
      throw error;
    }
    const parsed: unknown = JSON.parse(content);
    if (!isRecord(parsed) || parsed.schemaVersion !== 1) {
      throw new Error("Execution recovery file has an invalid schema.");
    }
    if (
      !Array.isArray(parsed.records) ||
      !parsed.records.every(isRecoveryRecord)
    ) {
      throw new Error("Execution recovery file contains invalid records.");
    }
    return parsed.records;
  }

  public async upsert(
    projectRoot: string,
    record: ExecutionRecoveryRecord,
  ): Promise<void> {
    await this.writeQueue.enqueue(projectRoot, async () => {
      const current = await this.read(projectRoot);
      const records = [
        ...current.filter((item) => item.executionId !== record.executionId),
        record,
      ].sort((left, right) =>
        left.executionId.localeCompare(right.executionId),
      );
      const written = await writeFileAtomically(
        resolve(projectRoot, executionRecoveryRelativePath),
        `${JSON.stringify({ schemaVersion: 1, records }, null, 2)}\n`,
      );
      if (!written.ok) throw new Error(written.error.message);
    });
  }

  public async remove(
    projectRoot: string,
    executionId: ExecutionId,
  ): Promise<void> {
    await this.writeQueue.enqueue(projectRoot, async () => {
      const current = await this.read(projectRoot);
      const records = current.filter(
        (item) => item.executionId !== executionId,
      );
      const written = await writeFileAtomically(
        resolve(projectRoot, executionRecoveryRelativePath),
        `${JSON.stringify({ schemaVersion: 1, records }, null, 2)}\n`,
      );
      if (!written.ok) throw new Error(written.error.message);
    });
  }
}
