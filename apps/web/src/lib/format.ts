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
  const maximumFractionDigits = options.maximumFractionDigits ?? 2;
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
