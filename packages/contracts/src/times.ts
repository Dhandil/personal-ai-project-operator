import { z } from "zod";

const UTC_ISO_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;

export type UtcIsoTimestamp = string & {
  readonly __brand: "UtcIsoTimestamp";
};

function matchesUtcIsoTimestamp(value: string): boolean {
  const match = UTC_ISO_PATTERN.exec(value);
  if (match === null) {
    return false;
  }

  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    fractionText,
  ] = match;
  if (
    yearText === undefined ||
    monthText === undefined ||
    dayText === undefined ||
    hourText === undefined ||
    minuteText === undefined ||
    secondText === undefined
  ) {
    return false;
  }

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number((fractionText ?? "").padEnd(3, "0"));
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, millisecond);

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second &&
    date.getUTCMilliseconds() === millisecond
  );
}

export const utcIsoTimestampSchema = z
  .string()
  .refine(matchesUtcIsoTimestamp, "时间必须是有效的 UTC ISO 字符串并以 Z 结尾")
  .transform((value) => value as UtcIsoTimestamp);

export function isUtcIsoTimestamp(value: unknown): value is UtcIsoTimestamp {
  return typeof value === "string" && matchesUtcIsoTimestamp(value);
}

export function parseUtcIsoTimestamp(value: unknown): UtcIsoTimestamp {
  return utcIsoTimestampSchema.parse(value);
}
