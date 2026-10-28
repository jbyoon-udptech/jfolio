import { TIME_ZONE } from "@/lib/format";

export const PERIODS = ["1D", "1W", "1M", "3M", "6M", "YTD", "1Y", "ALL"] as const;
export type Period = (typeof PERIODS)[number];
export const DEFAULT_PERIOD: Period = "3M";

const DAY = 86_400_000;

function timeZoneOffset(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(
    values.year ?? 1970,
    (values.month ?? 1) - 1,
    values.day ?? 1,
    values.hour ?? 0,
    values.minute ?? 0,
    values.second ?? 0,
  );
  return asUtc - date.getTime();
}

/** UTC instant of local midnight on January 1 of the year containing `now`. */
function startOfYearInTimeZone(now: Date, timeZone: string): Date {
  const year = Number(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(now),
  );
  const midnightUtc = Date.UTC(year, 0, 1);
  const offset = timeZoneOffset(new Date(midnightUtc), timeZone);
  return new Date(midnightUtc - offset);
}

/** Translate a UI period into a history range + interval (UI-001). */
export function periodRange(
  period: Period,
  now: Date = new Date(),
): { from: Date; to: Date; interval: "hourly" | "daily" } {
  switch (period) {
    case "1D":
      return { from: new Date(now.getTime() - DAY), to: now, interval: "hourly" };
    case "1W":
      return { from: new Date(now.getTime() - 7 * DAY), to: now, interval: "daily" };
    case "1M":
      return { from: new Date(now.getTime() - 30 * DAY), to: now, interval: "daily" };
    case "3M":
      return { from: new Date(now.getTime() - 90 * DAY), to: now, interval: "daily" };
    case "6M":
      return { from: new Date(now.getTime() - 180 * DAY), to: now, interval: "daily" };
    case "YTD":
      return { from: startOfYearInTimeZone(now, TIME_ZONE), to: now, interval: "daily" };
    case "1Y":
      return { from: new Date(now.getTime() - 365 * DAY), to: now, interval: "daily" };
    case "ALL":
    default:
      return { from: new Date(now.getTime() - 365 * DAY), to: now, interval: "daily" };
  }
}

export function normalizePeriod(value: string | undefined): Period {
  return (PERIODS as readonly string[]).includes(value ?? "")
    ? (value as Period)
    : DEFAULT_PERIOD;
}
