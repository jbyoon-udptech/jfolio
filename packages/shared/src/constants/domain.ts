/**
 * Domain constants shared between the API and the web app.
 * Keep these in sync with the corresponding union types in `src/types`.
 */

export const ASSET_TYPES = [
  "STOCK",
  "ETF",
  "CRYPTO",
  "FX",
  "BOND",
  "COMMODITY",
  "CASH",
] as const;

export const DATA_INTERVALS = ["tick", "10s", "1m", "5m", "1h", "1d"] as const;

export const TRANSACTION_TYPES = [
  "BUY",
  "SELL",
  "DEPOSIT",
  "WITHDRAWAL",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "DIVIDEND",
  "INTEREST",
  "FEE",
  "SPLIT",
  "ADJUSTMENT",
] as const;

export const SIGNAL_TYPES = [
  "PRICE_DROP",
  "PRICE_RISE",
  "PRICE_THRESHOLD",
  "PORTFOLIO_THRESHOLD",
] as const;

export const REFERENCE_TYPES = [
  "FIXED_PRICE",
  "PREVIOUS_CLOSE",
  "ROLLING_HIGH",
  "ROLLING_WINDOW",
] as const;

export const SNAPSHOT_TYPES = ["INTRADAY", "DAILY", "ON_DEMAND"] as const;

/**
 * FR-014 / UI-006: machine readable data quality state. A value of
 * `UNAVAILABLE` must never be rendered as 0.
 */
export const DATA_STATUSES = [
  "NORMAL",
  "DELAYED",
  "STALE",
  "ERROR",
  "NO_DATA",
  "UNAVAILABLE",
] as const;

export const COLLECTION_JOB_STATUSES = [
  "RUNNING",
  "SUCCESS",
  "PARTIAL",
  "FAILED",
] as const;

export const DEFAULT_BASE_CURRENCY = "KRW" as const;
export const DEFAULT_TIMEZONE = "Asia/Seoul" as const;

/** Currencies used by the built-in providers / seed data. */
export const SUPPORTED_CURRENCIES = ["KRW", "USD", "JPY", "EUR", "USDT"] as const;

/** Fallback display precision per currency (fraction digits). */
export const CURRENCY_PRECISION: Record<string, number> = {
  KRW: 0,
  JPY: 0,
  USD: 2,
  EUR: 2,
  USDT: 2,
};
