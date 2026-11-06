import type { TRANSACTION_TYPES, SNAPSHOT_TYPES, DATA_STATUSES } from "../constants/domain";

export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export type SnapshotType = (typeof SNAPSHOT_TYPES)[number];
export type DataStatus = (typeof DATA_STATUSES)[number];

export interface Portfolio {
  portfolioId: string;
  /** Reserved for future multi-user support (FR-030). */
  userId: string;
  name: string;
  baseCurrency: string;
  isDefault: boolean;
  /** Hidden from the portfolio list page; data and selections stay intact. */
  isHidden: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * FR-032: An immutable source-of-truth record of any change to holdings.
 * `quantity` semantics per type:
 *  - BUY / SELL / DEPOSIT / WITHDRAWAL / TRANSFER_IN / TRANSFER_OUT: units moved
 *  - SPLIT: split ratio (e.g. 2 for 2-for-1)
 *  - ADJUSTMENT: the absolute target quantity
 * `price` is the per-unit price in `currency` when applicable.
 */
export interface Transaction {
  transactionId: string;
  portfolioId: string;
  instrumentId: string;
  type: TransactionType;
  timestamp: Date;
  quantity: number;
  price: number;
  currency: string;
  fee: number;
  feeCurrency?: string;
  externalReference?: string | null;
  memo?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type TransactionInput = Omit<
  Transaction,
  "transactionId" | "createdAt" | "updatedAt" | "feeCurrency" | "currency"
> &
  Partial<Pick<Transaction, "transactionId" | "feeCurrency" | "currency">>;

/**
 * FR-031: Derived holdings. Not the source of truth — always reconstructable
 * from the transaction ledger.
 */
export interface Position {
  portfolioId: string;
  instrumentId: string;
  quantity: number;
  /** Moving-average acquisition cost per unit, in `costCurrency`. */
  averageCost: number;
  costCurrency: string;
  /** Total acquisition cost of the remaining quantity. */
  costBasis: number;
  firstAcquiredAt: Date | null;
  updatedAt: Date;
}

/** Realised P&L accumulated per instrument (FR-046). */
export interface RealizedPnl {
  instrumentId: string;
  currency: string;
  realizedPnl: number;
  dividends: number;
  interest: number;
  fees: number;
}

export interface CashBalance {
  currency: string;
  amount: number;
  valueInBaseCurrency: number;
  status: DataStatus;
}

export interface ValuedPosition {
  instrumentId: string;
  symbol: string;
  name: string;
  assetType: string;
  currency: string;
  quantity: number;
  price: number | null;
  priceCurrency: string;
  priceTimestamp: Date | null;
  fxRateToBase: number | null;
  marketValue: number | null;
  marketValueBase: number | null;
  costBasis: number | null;
  costBasisBase: number | null;
  unrealizedPnL: number | null;
  unrealizedReturn: number | null;
  /**
   * Latest quote-price change vs the previous daily close, in percent points
   * (e.g. -5.25 means -5.25%). Null when no previous close is available.
   * This is a price change, not a change in position market value.
   */
  dailyChangeRate: number | null;
  /** FR-053 / UI-006: never render an unavailable valuation as 0. */
  status: DataStatus;
  statusReason?: string;
}

/** One day's close for a held asset, with the move vs the previous close. */
export interface AssetDailyPricePoint {
  /** UTC day the quote belongs to (start of day). */
  asOf: Date;
  price: number | null;
  /** Absolute price change vs the previous available daily close, in `currency`. */
  change: number | null;
  /** Percentage change vs the previous available daily close (e.g. -1.25). */
  changeRate: number | null;
}

export interface AssetDailyPriceSeries {
  instrumentId: string;
  symbol: string;
  name: string;
  assetType: string;
  /** Native quote currency for `price` and `change`. */
  currency: string;
  /** Aligned with `AssetDailyPriceHistory.dates`. */
  points: AssetDailyPricePoint[];
}

/** Daily portfolio total in the base currency, aligned with `dates`. */
export interface AssetDailyTotal {
  totalAssetValue: number | null;
  /** Percentage change vs the previous available daily total. */
  changeRate: number | null;
}

export interface AssetDailyPriceHistory {
  portfolioId: string;
  /** Portfolio base currency used by `totals`. */
  baseCurrency: string;
  /** First displayed day (inclusive). */
  from: Date;
  /** Last displayed day (inclusive). */
  to: Date;
  /** Days with at least one quote, newest first. */
  dates: Date[];
  /** One series per non-cash holding, sorted by symbol. */
  series: AssetDailyPriceSeries[];
  /** Daily portfolio total (including cash), aligned with `dates`. */
  totals: AssetDailyTotal[];
}

export interface PortfolioSnapshot {
  snapshotId: string;
  portfolioId: string;
  snapshotType: SnapshotType;
  /** Evaluation time (UTC). */
  asOf: Date;
  capturedAt: Date;
  baseCurrency: string;
  totalAssetValue: number | null;
  totalCostBasis: number | null;
  unrealizedPnL: number | null;
  dataStatus: DataStatus;
  positions: Array<{
    instrumentId: string;
    quantity: number;
    price: number | null;
    priceCurrency: string;
    priceTimestamp: Date | null;
    fxRateToBase: number | null;
    marketValue: number | null;
    marketValueBase: number | null;
    costBasis?: number | null;
    unrealizedPnL?: number | null;
    status: DataStatus;
  }>;
  cashBalances: Array<{
    currency: string;
    amount: number;
    valueInBaseCurrency: number | null;
  }>;
}
