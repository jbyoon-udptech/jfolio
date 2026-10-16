/**
 * Timezone helpers for aligning scheduled snapshots to calendar boundaries.
 *
 * All timestamps are stored in UTC; only boundary computation needs the
 * configured display timezone (default Asia/Seoul, SPEC 8.1).
 */

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function partsInTimeZone(date: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const values: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return {
    year: values.year ?? 1970,
    month: values.month ?? 1,
    day: values.day ?? 1,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
    second: values.second ?? 0,
  };
}

/** Offset in milliseconds of `timeZone` at the given instant (east of UTC is positive). */
export function timeZoneOffset(date: Date, timeZone: string): number {
  const p = partsInTimeZone(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

/** UTC instant of the start of the hour containing `date`. */
export function startOfHour(date: Date): Date {
  const result = new Date(date.getTime());
  result.setUTCMinutes(0, 0, 0);
  return result;
}

/** UTC instant of local midnight for the calendar day containing `date`. */
export function startOfDayInTimeZone(date: Date, timeZone: string): Date {
  const p = partsInTimeZone(date, timeZone);
  const naiveUtc = Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0);
  // Subtract the offset at (approximately) that instant; Asia/Seoul has no DST.
  const offset = timeZoneOffset(new Date(naiveUtc), timeZone);
  return new Date(naiveUtc - offset);
}

/** Milliseconds until the next occurrence of the given boundary function. */
export function msUntilNext(boundary: (date: Date) => Date, from: Date, periodMs: number): number {
  const current = boundary(from).getTime();
  const next = current + periodMs;
  return Math.max(0, next - from.getTime());
}
