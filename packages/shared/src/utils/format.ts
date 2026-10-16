import { CURRENCY_PRECISION } from "../constants/domain";

/** Round a numeric value to `digits` decimal places (half-up on magnitude). */
export function roundTo(value: number, digits: number): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Round using the conventional precision for a currency (KRW/JPY => 0). */
export function roundCurrency(value: number, currency: string): number {
  return roundTo(value, CURRENCY_PRECISION[currency] ?? 2);
}

/** Format a number for display with thousands separators. */
export function formatNumber(value: number | null | undefined, currency?: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const digits = currency ? (CURRENCY_PRECISION[currency] ?? 2) : 2;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}
