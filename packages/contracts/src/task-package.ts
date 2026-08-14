import { z } from "zod";

const taskIdSchema = z
  .string()
  .regex(/^TASK-\d{3}$/)
  .refine((value) => Number(value.slice(5)) > 0)
  .transform((value) => value as `TASK-${string}`);

const nonEmptyString = z.string().trim().min(1);

export const taskPackageRoles = ["executor", "reviewer"] as const;
export type TaskPackageRole = (typeof taskPackageRoles)[number];

export const taskPackageOutputSchemaIds = [
  "executor_result_v1",
  "reviewer_result_v1",
] as const;
export type TaskPackageOutputSchemaId =
  (typeof taskPackageOutputSchemaIds)[number];

const verificationResultSchema = z
  .object({
    command: nonEmptyString,
    status: z.enum(["passed", "failed", "skipped"]),
    evidence: z.array(nonEmptyString),
  })
  .strict();

export const executorOutputSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("executor_result"),
    taskId: taskIdSchema,
    status: z.enum(["completed", "blocked", "interrupted", "failed"]),
    summary: nonEmptyString,
    changedPaths: z.array(nonEmptyString),
    verification: z
      .object({
        commands: z.array(nonEmptyString),
        results: z.array(verificationResultSchema),
      })
      .strict(),
    evidence: z.array(nonEmptyString),
    commit: nonEmptyString.nullable(),
    outstandingIssues: z.array(nonEmptyString),
    handoff: nonEmptyString,
  })
  .strict();

export type ExecutorOutput = z.output<typeof executorOutputSchema>;

const reviewFindingSchema = z
  .object({
    severity: z.enum(["low", "medium", "high", "blocker"]),
    path: nonEmptyString,
    message: nonEmptyString,
  })
  .strict();

export const reviewerOutputSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("reviewer_result"),
    taskId: taskIdSchema,
    decision: z.enum(["accepted", "changes_requested", "blocked"]),
    findings: z.array(reviewFindingSchema),
    verificationEvidence: z.array(nonEmptyString),
    requiredChanges: z.array(nonEmptyString),
    handoff: nonEmptyString,
  })
  .strict();

export type ReviewerOutput = z.output<typeof reviewerOutputSchema>;

export type StructuredAgentOutput = ExecutorOutput | ReviewerOutput;

export type StructuredOutputValidation = Readonly<{
  readonly ok: boolean;
  readonly role: TaskPackageRole;
  readonly output: StructuredAgentOutput | null;
  readonly details: readonly string[];
}>;

function schemaFor(role: TaskPackageRole) {
  return role === "executor" ? executorOutputSchema : reviewerOutputSchema;
}

export function validateStructuredAgentOutput(
  role: TaskPackageRole,
  value: unknown,
): StructuredOutputValidation {
  const parsed = schemaFor(role).safeParse(value);
  if (parsed.success) {
    return {
      ok: true,
      role,
      output: parsed.data as StructuredAgentOutput,
      details: [],
    };
  }
  return {
    ok: false,
    role,
    output: null,
    details: parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "output"}: ${issue.message}`,
    ),
  };
}

export function outputSchemaIdForRole(
  role: TaskPackageRole,
): TaskPackageOutputSchemaId {
  return role === "executor" ? "executor_result_v1" : "reviewer_result_v1";
}
