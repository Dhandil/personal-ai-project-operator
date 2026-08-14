import type { TaskId } from "@personal-ai-operator/contracts";

import type { Issue } from "./issue.js";
import { recordFailure } from "./record.js";
import type { DomainResult } from "./workflow.js";

export type IssuePausePlan = Readonly<{
  readonly issueId: Issue["id"];
  readonly pauseTaskIds: readonly TaskId[];
  readonly pauseExecutionChain: boolean;
  readonly rationale: string;
}>;

export function deriveIssuePausePlan(
  issue: Issue,
): DomainResult<IssuePausePlan> {
  if (issue.status === "completed" || issue.status === "cancelled") {
    return recordFailure(
      "invalid_issue_impact",
      "A closed issue cannot pause an execution chain.",
    );
  }

  if (
    (issue.impact === "task" || issue.impact === "execution_chain") &&
    issue.affectedTaskIds.length === 0
  ) {
    return recordFailure(
      "invalid_issue_impact",
      "Task and execution-chain issues must identify affected tasks.",
    );
  }

  if (issue.impact === "unknown") {
    return {
      ok: true,
      value: {
        issueId: issue.id,
        pauseTaskIds: [],
        pauseExecutionChain: true,
        rationale:
          "Unknown impact pauses the execution chain until scope is known.",
      },
    };
  }

  return {
    ok: true,
    value: {
      issueId: issue.id,
      pauseTaskIds: [...issue.affectedTaskIds],
      pauseExecutionChain: issue.impact === "execution_chain",
      rationale: "Only the explicitly affected tasks are paused.",
    },
  };
}

export function shouldPauseTask(plan: IssuePausePlan, taskId: TaskId): boolean {
  return plan.pauseTaskIds.includes(taskId);
}
