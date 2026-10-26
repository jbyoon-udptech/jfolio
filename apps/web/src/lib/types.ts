import type { DataStatus } from "@jfolio/shared";

/**
 * Lightweight view-models for the API responses consumed by the dashboard.
 * Dates arrive as ISO strings because they cross the JSON boundary.
 */

export interface Instrument {
  instrumentId: string;
  symbol: string;
  name: string;
  assetType: string;
  market: string;
  currency: string;
  isActive: boolean;
  isWatchlist: boolean;
  /** Provider links (at most one per asset). */
  providers: Array<{ providerId: string; providerSymbol: string }>;
  createdAt: string;
  updatedAt: string;
  latestQuote?: MarketQuote | null;
}

export interface MarketQuote {
  instrumentId: string;
  providerId: string;
  interval: string;
  timestamp: string;
  receivedAt: string;
  price: number;
  currency: string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
  isFinal?: boolean;
  /** Change ratio vs previous close as a fraction (e.g. -0.05). */
  changeRate?: number | null;
}

export interface Portfolio {
  portfolioId: string;
  userId: string;
  name: string;
  baseCurrency: string;
  isDefault: boolean;
  isHidden: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  transactionId: string;
  portfolioId: string;
  instrumentId: string;
  type: string;
  timestamp: string;
  quantity: number;
  price: number;
  currency: string;
  fee: number;
  feeCurrency?: string;
  externalReference: string | null;
  memo: string | null;
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
  priceTimestamp: string | null;
  fxRateToBase: number | null;
  marketValue: number | null;
  marketValueBase: number | null;
  costBasis: number | null;
  costBasisBase: number | null;
  unrealizedPnL: number | null;
  unrealizedReturn: number | null;
  /** Latest quote-price change vs the previous daily close, in percent points. */
  dailyChangeRate: number | null;
  status: DataStatus;
  statusReason?: string;
}

export interface CashBalance {
  currency: string;
  amount: number;
  valueInBaseCurrency: number | null;
  status: DataStatus;
}

export interface Valuation {
  portfolioId: string;
  baseCurrency: string;
  asOf: string;
  dataStatus: DataStatus;
  totalAssetValue: number | null;
  totalCostBasis: number | null;
  unrealizedPnL: number | null;
  unrealizedReturn: number | null;
  positions: ValuedPosition[];
  cashBalances: CashBalance[];
  unavailableCount: number;
  warnings: string[];
}

export interface AllocationSlice {
  key: string;
  marketValueBase: number;
  weight: number;
}

export interface SignalEvent {
  eventId: string;
  ruleId: string;
  instrumentId: string;
  portfolioId: string | null;
  signalType: string;
  observedPrice: number;
  referencePrice: number | null;
  changeRate: number | null;
  threshold: number;
  triggeredAt: string;
  status: string;
  deduplicationKey: string;
  message?: string;
}

export interface SignalRule {
  ruleId: string;
  portfolioId: string | null;
  instrumentId: string;
  signalType: string;
  threshold: number;
  referenceType: string;
  referenceValue: number | null;
  windowSeconds: number | null;
  isEnabled: boolean;
  cooldownSeconds: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Dashboard {
  portfolioId: string;
  baseCurrency: string;
  asOf: string;
  totalAssetValue: number | null;
  dailyChange: number | null;
  dailyChangeRate: number | null;
  totalCostBasis: number | null;
  unrealizedPnL: number | null;
  unrealizedReturn: number | null;
  dataStatus: DataStatus;
  unavailableCount: number;
  allocationByAssetType: AllocationSlice[];
  allocationByCurrency: AllocationSlice[];
  topHoldings: ValuedPosition[];
  recentSignals: SignalEvent[];
  lastDataUpdatedAt: string | null;
}

export interface HistoryPoint {
  asOf: string;
  totalAssetValue: number | null;
  dataStatus: DataStatus;
}

export interface PortfolioSnapshot {
  snapshotId: string;
  portfolioId: string;
  snapshotType: string;
  asOf: string;
  capturedAt: string;
  baseCurrency: string;
  totalAssetValue: number | null;
  totalCostBasis: number | null;
  unrealizedPnL: number | null;
  dataStatus: DataStatus;
}

export interface ProviderState {
  providerId: string;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastDataTimestamp: string | null;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  lastError: string | null;
  status: DataStatus;
}

export interface SystemDataStatus {
  status: DataStatus;
  lastUpdatedAt: string | null;
  latestQuoteAt: string | null;
  latestCollectionAt: string | null;
  providers: ProviderState[];
  recentJobs: Array<{
    jobId: string;
    providerId: string;
    assetType: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    insertedCount: number;
    failedCount: number;
  }>;
}

export interface ProviderStatusView {
  providerId: string;
  displayName: string;
  assetTypes: string[];
  capabilities: Record<string, boolean>;
  /** False when collection only runs on demand (scheduler disabled). */
  schedulerEnabled: boolean;
  /** Cadence of the scheduled runs for this provider's asset types. */
  collectionIntervals: Array<{ assetType: string; seconds: number }>;
  state: ProviderState | null;
}

export interface ListResponse<T> {
  items: T[];
  total: number;
  limit?: number;
  offset?: number;
}
