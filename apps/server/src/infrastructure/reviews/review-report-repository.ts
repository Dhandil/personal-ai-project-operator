import { readdir } from "node:fs/promises";
import { join } from "node:path";

import {
  parseFormalId,
  reviewReportSchema,
  type ReportId,
  type ReviewReport,
} from "@personal-ai-operator/contracts";

import { GovernanceRepository } from "../files/governance-repository.js";

export const reviewReportDirectory = ".personal-workspace/reviews";

export type ReviewReportRepositoryErrorCode =
  "invalid_report" | "not_found" | "read_failed" | "write_failed";

export type ReviewReportRepositoryError = Readonly<{
  readonly code: ReviewReportRepositoryErrorCode;
  readonly message: string;
  readonly details: readonly string[];
}>;

export type ReviewReportRepositoryResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{
      readonly ok: false;
      readonly error: ReviewReportRepositoryError;
    }>;

function failure<Value>(
  code: ReviewReportRepositoryErrorCode,
  message: string,
  details: readonly string[] = [],
): ReviewReportRepositoryResult<Value> {
  return { ok: false, error: { code, message, details } };
}

function reportPath(reportId: ReportId): string {
  return join(reviewReportDirectory, `${reportId}.md`);
}

function reportBody(report: ReviewReport): string {
  const findings =
    report.findings.length === 0
      ? ["- None"]
      : report.findings.map(
          (finding) =>
            `- [${finding.severity}] ${finding.path}: ${finding.message}`,
        );
  const requiredChanges =
    report.requiredChanges.length === 0
      ? ["- None"]
      : report.requiredChanges.map((change) => `- ${change}`);
  return [
    `# Review report ${report.id}`,
    "",
    `Decision: ${report.decision}`,
    `Task: ${report.taskId}`,
    `Execution: ${report.executionId}`,
    `Reviewer execution: ${report.reviewerExecutionId}`,
    "",
    "## Findings",
    ...findings,
    "",
    "## Required changes",
    ...requiredChanges,
    "",
    "## Evidence",
    `- Git boundary passed: ${String(report.diff.passed)}`,
    `- Required evidence verified: ${String(report.evidence.verified)}`,
    `- Verification commands: ${String(report.tests.length)}`,
    "",
  ].join("\n");
}

function parseReport(
  value: unknown,
): ReviewReportRepositoryResult<ReviewReport> {
  const parsed = reviewReportSchema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };
  return failure(
    "invalid_report",
    "The stored review report does not satisfy its schema.",
    parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "report"}: ${issue.message}`,
    ),
  );
}

export class ReviewReportRepository {
  public async save(
    projectRoot: string,
    report: ReviewReport,
  ): Promise<ReviewReportRepositoryResult<ReviewReport>> {
    const valid = parseReport(report);
    if (!valid.ok) return valid;
    const written = await new GovernanceRepository(projectRoot).write(
      reportPath(report.id as ReportId),
      {
        frontMatter: report,
        body: reportBody(report),
      },
      null,
    );
    if (!written.ok) {
      return failure(
        "write_failed",
        written.error.message,
        written.error.details,
      );
    }
    return { ok: true, value: report };
  }

  public async read(
    projectRoot: string,
    reportId: string,
  ): Promise<ReviewReportRepositoryResult<ReviewReport>> {
    if (!/^REPORT-(?!000)\d{3}$/.test(reportId)) {
      return failure("invalid_report", "A REPORT-### identifier is required.");
    }
    const snapshot = await new GovernanceRepository(projectRoot).read(
      reportPath(parseFormalId(reportId) as ReportId),
    );
    if (!snapshot.ok) {
      return failure(
        snapshot.error.code === "not_found" ? "not_found" : "read_failed",
        snapshot.error.message,
        snapshot.error.details,
      );
    }
    return parseReport(snapshot.value.document.frontMatter);
  }

  public async nextId(
    projectRoot: string,
  ): Promise<ReviewReportRepositoryResult<ReportId>> {
    const numbers: number[] = [];
    for (const directory of [
      ".personal-workspace/reports",
      reviewReportDirectory,
    ]) {
      try {
        const names = await readdir(join(projectRoot, directory));
        for (const name of names) {
          const match = /^REPORT-(\d{3})\.md$/.exec(name);
          if (match !== null) numbers.push(Number(match[1]));
        }
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          continue;
        }
        return failure("read_failed", "Report inventory could not be read.", [
          error instanceof Error ? error.message : String(error),
        ]);
      }
    }
    const next = Math.max(0, ...numbers) + 1;
    if (next > 999) {
      return failure("write_failed", "Review report ID capacity exceeded.");
    }
    return {
      ok: true,
      value: parseFormalId(
        `REPORT-${String(next).padStart(3, "0")}`,
      ) as ReportId,
    };
  }
}
