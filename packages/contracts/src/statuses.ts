import { z } from "zod";

export const normalStatuses = [
  "draft",
  "ready",
  "in_progress",
  "in_review",
  "completed",
] as const;

export const controlStatuses = [
  "blocked",
  "changes_requested",
  "paused",
  "cancelled",
] as const;

export const statusValues = [...normalStatuses, ...controlStatuses] as const;
export type RecordStatus = (typeof statusValues)[number];
export type NormalStatus = (typeof normalStatuses)[number];
export type ControlStatus = (typeof controlStatuses)[number];

export const statusSchema = z.enum(statusValues);

export function isRecordStatus(value: unknown): value is RecordStatus {
  return (
    typeof value === "string" && statusValues.includes(value as RecordStatus)
  );
}

export function parseRecordStatus(value: unknown): RecordStatus {
  return statusSchema.parse(value);
}
