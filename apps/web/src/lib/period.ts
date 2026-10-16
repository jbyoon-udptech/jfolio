export const PERIODS = ["1D", "1W", "1M", "3M", "6M", "1Y", "ALL"] as const;
export type Period = (typeof PERIODS)[number];

const DAY = 86_400_000;

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
    case "1Y":
      return { from: new Date(now.getTime() - 365 * DAY), to: now, interval: "daily" };
    case "ALL":
    default:
      return { from: new Date(now.getTime() - 365 * DAY), to: now, interval: "daily" };
  }
}

export function normalizePeriod(value: string | undefined): Period {
  return (PERIODS as readonly string[]).includes(value ?? "") ? (value as Period) : "1M";
}
