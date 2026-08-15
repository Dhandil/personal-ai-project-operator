import { z } from "zod";

import { formalIdSchema } from "./identifiers.js";
import { utcIsoTimestampSchema } from "./times.js";

const reportIdSchema = formalIdSchema.refine(
  (value) => value.startsWith("REPORT-"),
  "Review report id must be a REPORT-### identifier.",
);
const taskIdSchema = formalIdSchema.refine(
  (value) => value.startsWith("TASK-"),
  "Review report task id must be a TASK-### identifier.",
);
const executionIdSchema = formalIdSchema.refine(
  (value) => value.startsWith("EXEC-"),
  "Review report execution id must be an EXEC-### identifier.",
);
const nonEmptyString = z.string().trim().min(1);

const changeSchema = z
  .object({
    path: nonEmptyString,
    previousPath: nonEmptyString.nullable(),
    kind: z.enum([
      "added",
      "modified",
      "deleted",
      "renamed",
      "copied",
      "untracked",
    ]),
    indexStatus: z.string(),
    worktreeStatus: z.string(),
    contentHash: z.string().nullable(),
  })
  .strict();

const violationSchema = z
  .object({
    code: nonEmptyString,
    path: nonEmptyString.optional(),
    action: nonEmptyString.optional(),
    message: nonEmptyString,
  })
  .strict();

const artifactSchema = z
  .object({
    path: nonEmptyString,
    exists: z.boolean(),
    kind: z.enum(["file", "directory", "missing", "invalid_path"]),
  })
  .strict();

const verificationSchema = z
  .object({
    command: nonEmptyString,
    exitCode: z.number().int(),
    stdout: z.string(),
    stderr: z.string(),
    error: z.string().nullable(),
  })
  .strict();

const findingSchema = z
  .object({
    severity: z.enum(["low", "medium", "high", "blocker"]),
    path: nonEmptyString,
    message: nonEmptyString,
  })
  .strict();

export const reviewReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    documentType: z.literal("review_report"),
    kind: z.literal("review_report"),
    id: reportIdSchema,
    revision: z.literal(1),
    projectKey: nonEmptyString,
    taskId: taskIdSchema,
    goalId: formalIdSchema.refine(
      (value) => value.startsWith("GOAL-"),
      "Review report goal id must be a GOAL-### identifier.",
    ),
    executionId: executionIdSchema,
    reviewerExecutionId: executionIdSchema,
    previousReportId: reportIdSchema.nullable(),
    reviewRound: z.number().int().min(1),
    reviewerInstanceId: executionIdSchema,
    decision: z.enum(["accepted", "changes_requested", "blocked"]),
    readOnly: z.literal(true),
    sandbox: z.literal("read-only"),
    createdAt: utcIsoTimestampSchema,
    updatedAt: utcIsoTimestampSchema,
    diff: z
      .object({
        passed: z.boolean(),
        changes: z.array(changeSchema),
        violations: z.array(violationSchema),
        beforeHead: z.string(),
        afterHead: z.string(),
        beforeBranch: z.string().nullable(),
        afterBranch: z.string().nullable(),
      })
      .strict(),
    files: z.array(artifactSchema),
    tests: z.array(verificationSchema),
    evidence: z
      .object({
        required: z.array(nonEmptyString),
        verified: z.boolean(),
        details: z.array(nonEmptyString),
      })
      .strict(),
    findings: z.array(findingSchema),
    verificationEvidence: z.array(nonEmptyString),
    requiredChanges: z.array(nonEmptyString),
    handoff: nonEmptyString,
    reviewerDiagnostics: z.array(nonEmptyString),
    auditEventIds: z.array(executionIdSchema),
  })
  .strict();

export type ReviewReport = z.output<typeof reviewReportSchema>;
