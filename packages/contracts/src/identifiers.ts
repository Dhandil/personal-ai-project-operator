import { z } from "zod";

const ID_PREFIXES = [
  "GOAL",
  "TASK",
  "DEC",
  "HANDOFF",
  "REPORT",
  "EXEC",
] as const;
const FORMAL_ID_PATTERN = /^(GOAL|TASK|DEC|HANDOFF|REPORT|EXEC)-\d{3}$/;

type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
type ThreeDigitNumber = `${Digit}${Digit}${Digit}`;

export type IdPrefix = (typeof ID_PREFIXES)[number];
export type GoalId = `GOAL-${ThreeDigitNumber}`;
export type TaskId = `TASK-${ThreeDigitNumber}`;
export type DecisionId = `DEC-${ThreeDigitNumber}`;
export type HandoffId = `HANDOFF-${ThreeDigitNumber}`;
export type ReportId = `REPORT-${ThreeDigitNumber}`;
export type ExecutionId = `EXEC-${ThreeDigitNumber}`;
export type FormalId =
  GoalId | TaskId | DecisionId | HandoffId | ReportId | ExecutionId;

export const idPrefixes = ID_PREFIXES;

function matchesFormalId(value: string): boolean {
  if (!FORMAL_ID_PATTERN.test(value)) {
    return false;
  }

  return Number(value.slice(value.indexOf("-") + 1)) > 0;
}

export const formalIdSchema = z
  .string()
  .regex(FORMAL_ID_PATTERN, "ID 必须使用已确认的前缀和三位数字序号")
  .refine((value) => Number(value.slice(value.indexOf("-") + 1)) > 0, {
    message: "ID 序号必须大于 000",
  })
  .transform((value) => value as FormalId);

export function isFormalId(value: unknown): value is FormalId {
  return typeof value === "string" && matchesFormalId(value);
}

export function parseFormalId(value: unknown): FormalId {
  return formalIdSchema.parse(value);
}
