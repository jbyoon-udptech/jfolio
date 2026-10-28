/**
 * UI-006: formatting helpers that never render missing data as zero.
 *
 * Any `null`/`undefined`/non-finite value renders as an explicit placeholder so
 * a missing price, FX rate or P&L can never be mistaken for a real 0.
 */

export const UNAVAILABLE = "평가 불가";
export const EMPTY = "—";
export const TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE ?? "Asia/Seoul";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Group-separated number with a bounded number of fraction digits. */
export function formatNumber(
  value: number | null | undefined,
  options: { minimumFractionDigits?: number; maximumFractionDigits?: number } = {},
): string {
  if (!isFiniteNumber(value)) return EMPTY;
  const { minimumFractionDigits = 0, maximumFractionDigits = 2 } = options;
  return new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
}

/** Currencies whose display amounts have no minor unit. */
const ZERO_DECIMAL_CURRENCIES = new Set(["KRW", "JPY"]);

/**
 * Currency-aware amount. Falls back to a plain "<amount> <CODE>" string for
 * non-ISO codes (e.g. USDT) that `Intl.NumberFormat` rejects.
 */
export function formatCurrency(
  value: number | null | undefined,
  currency: string,
  options: { maximumFractionDigits?: number } = {},
): string {
  if (!isFiniteNumber(value)) return UNAVAILABLE;
  const maximumFractionDigits =
    options.maximumFractionDigits ?? (ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2);
  try {
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency,
      maximumFractionDigits,
    }).format(value);
  } catch {
    return `${formatNumber(value, { maximumFractionDigits })} ${currency}`;
  }
}

/** Price with adaptive precision (crypto may need more decimals). */
export function formatPrice(value: number | null | undefined, currency: string): string {
  if (!isFiniteNumber(value)) return EMPTY;
  const digits = Math.abs(value) > 0 && Math.abs(value) < 1 ? 6 : 2;
  return formatCurrency(value, currency, { maximumFractionDigits: digits });
}

export function formatQuantity(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return EMPTY;
  return formatNumber(value, { maximumFractionDigits: 8 });
}

/** `value` is expressed in percent units (25 => +25.00%). */
export function formatPercent(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return EMPTY;
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

/** Signed currency amount, e.g. "+₩2,500". */
export function formatSignedCurrency(
  value: number | null | undefined,
  currency: string,
): string {
  if (!isFiniteNumber(value)) return UNAVAILABLE;
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatCurrency(value, currency)}`;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Local (Asia/Seoul) date-time, e.g. "2026-10-16 21:00:00". Pass
 * `{ seconds: false }` for the minute-precision form used in compact labels.
 */
export function formatDateTime(
  value: string | Date | null | undefined,
  { seconds = true }: { seconds?: boolean } = {},
): string {
  const date = toDate(value);
  if (!date) return EMPTY;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" as const } : {}),
    hourCycle: "h23",
  }).format(date);
}

export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return EMPTY;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Compact local date for chart annotations, e.g. "10월 3일". */
export function formatMonthDay(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return EMPTY;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: TIME_ZONE,
    month: "long",
    day: "numeric",
  }).format(date);
}

/**
 * Format an instant as a `datetime-local` input value (`YYYY-MM-DDTHH:mm`) in
 * the browser's local time. `new Date(value)` round-trips to the same instant,
 * so edit forms can safely submit `new Date(value).toISOString()`.
 */
export function toLocalDateTimeInput(value: string | Date): string {
  const date = toDate(value);
  if (!date) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/** Percentage-point weight, e.g. 0.72 => "0.72%". */
export function formatWeight(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return EMPTY;
  return `${formatNumber(value, { maximumFractionDigits: 2 })}%`;
}

/** Human duration for a period in seconds, e.g. "10초", "1분", "1시간 30분". */
export function formatDuration(value: number | null | undefined): string {
  if (!isFiniteNumber(value) || value < 0) return EMPTY;
  const totalSeconds = Math.round(value);
  if (totalSeconds < 60) return `${totalSeconds}초`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    const seconds = totalSeconds % 60;
    return seconds ? `${totalMinutes}분 ${seconds}초` : `${totalMinutes}분`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}시간 ${minutes}분` : `${hours}시간`;
}

/**
 * Collection cadence of a provider. Assets are scheduled per asset type, so a
 * provider covering several types can have more than one period. When the
 * scheduler is disabled the API only collects on demand.
 */
export function formatCollectionInterval(
  intervals: ReadonlyArray<{ assetType: string; seconds: number }> | null | undefined,
  schedulerEnabled: boolean,
): string {
  if (!schedulerEnabled) return "수동";
  if (!intervals || intervals.length === 0) return EMPTY;
  if (intervals.length === 1) {
    const [only] = intervals;
    return formatDuration(only?.seconds);
  }
  const bySeconds = new Map<number, string[]>();
  for (const { assetType, seconds } of intervals) {
    bySeconds.set(seconds, [...(bySeconds.get(seconds) ?? []), assetType]);
  }
  return [...bySeconds.entries()]
    .map(([seconds, assetTypes]) => `${assetTypes.join("·")} ${formatDuration(seconds)}`)
    .join(" · ");
}
