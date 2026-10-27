import type { UserRepository } from "../users/user.repository";
import type {
  CollectionJob,
  DataInterval,
  FxRate,
  Instrument,
  LatestQuote,
  MarketQuote,
  Portfolio,
  PortfolioSnapshot,
  ProviderState,
  SignalEvent,
  SignalRule,
  SnapshotType,
  Transaction,
} from "@jfolio/shared";

export interface ListResult<T> {
  items: T[];
  total: number;
}

export interface InstrumentFilter {
  assetType?: string;
  market?: string;
  currency?: string;
  isActive?: boolean;
  isWatchlist?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface InstrumentRepository {
  create(instrument: Instrument): Promise<Instrument>;
  upsertByNaturalKey(instrument: Instrument): Promise<Instrument>;
  update(instrumentId: string, patch: Partial<Instrument>): Promise<Instrument | null>;
  findById(instrumentId: string): Promise<Instrument | null>;
  findBySymbol(symbol: string, market: string, currency: string): Promise<Instrument | null>;
  findMany(ids: string[]): Promise<Instrument[]>;
  list(filter?: InstrumentFilter): Promise<ListResult<Instrument>>;
  findActive(): Promise<Instrument[]>;
}

export interface HistoricalQuery {
  interval?: DataInterval;
  from?: Date;
  to?: Date;
  limit?: number;
}

export interface QuoteRepository {
  /** Insert if the logical key does not exist. Returns whether it was inserted. */
  insertQuote(quote: MarketQuote): Promise<boolean>;
  insertQuotes(quotes: MarketQuote[]): Promise<{ inserted: number; duplicates: number }>;
  getLatest(instrumentId: string): Promise<LatestQuote | null>;
  getLatestMany(instrumentIds: string[]): Promise<Map<string, LatestQuote>>;
  getHistorical(instrumentId: string, query?: HistoricalQuery): Promise<MarketQuote[]>;
  /** Latest quote strictly before `before` (for previous-close references). */
  getLastBefore(instrumentId: string, before: Date, interval?: DataInterval): Promise<MarketQuote | null>;
}

export interface FxRateQuery {
  from?: Date;
  to?: Date;
  limit?: number;
}

export interface FxRateRepository {
  upsertRate(rate: FxRate): Promise<void>;
  getRate(base: string, quote: string, asOf: Date): Promise<FxRate | null>;
  /** Rates for one pair in [from, to], newest first. Used by history prefetch. */
  getRates(base: string, quote: string, query?: FxRateQuery): Promise<FxRate[]>;
  getLatest(base: string, quote: string): Promise<FxRate | null>;
  listLatest(): Promise<FxRate[]>;
}

export interface PortfolioRepository {
  create(portfolio: Portfolio): Promise<Portfolio>;
  update(portfolioId: string, patch: Partial<Portfolio>): Promise<Portfolio | null>;
  findById(portfolioId: string): Promise<Portfolio | null>;
  list(userId?: string): Promise<Portfolio[]>;
  findDefault(userId: string): Promise<Portfolio | null>;
}

export interface TransactionFilter {
  portfolioId?: string;
  instrumentId?: string;
  type?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface TransactionRepository {
  create(transaction: Transaction): Promise<Transaction>;
  update(transactionId: string, patch: Partial<Transaction>): Promise<Transaction | null>;
  delete(transactionId: string): Promise<boolean>;
  findById(transactionId: string): Promise<Transaction | null>;
  list(filter?: TransactionFilter): Promise<ListResult<Transaction>>;
  /** All transactions for a portfolio up to `to` (inclusive), ascending by time. */
  listByPortfolio(portfolioId: string, to?: Date): Promise<Transaction[]>;
}

export interface SnapshotFilter {
  snapshotType?: SnapshotType;
  from?: Date;
  to?: Date;
  limit?: number;
}

export interface SnapshotRepository {
  /** Idempotent upsert keyed by portfolioId + snapshotType + asOf. */
  upsert(snapshot: PortfolioSnapshot): Promise<PortfolioSnapshot>;
  findById(snapshotId: string): Promise<PortfolioSnapshot | null>;
  list(portfolioId: string, filter?: SnapshotFilter): Promise<PortfolioSnapshot[]>;
  /** FR-034: invalidate snapshots at or after `asOf` after a ledger change. */
  deleteAfter(portfolioId: string, asOf: Date): Promise<number>;
}

export interface SignalRuleRepository {
  create(rule: SignalRule): Promise<SignalRule>;
  update(ruleId: string, patch: Partial<SignalRule>): Promise<SignalRule | null>;
  findById(ruleId: string): Promise<SignalRule | null>;
  list(filter?: { portfolioId?: string; instrumentId?: string; isEnabled?: boolean }): Promise<SignalRule[]>;
  findEnabled(): Promise<SignalRule[]>;
  findByInstrument(instrumentId: string): Promise<SignalRule[]>;
}

export interface SignalEventFilter {
  ruleId?: string;
  instrumentId?: string;
  portfolioId?: string;
  status?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface SignalEventRepository {
  /** Deduplicated by ruleId + deduplicationKey. */
  insert(event: SignalEvent): Promise<boolean>;
  list(filter?: SignalEventFilter): Promise<ListResult<SignalEvent>>;
  countByRule(ruleId: string): Promise<number>;
}

export interface CollectionJobRepository {
  create(job: CollectionJob): Promise<CollectionJob>;
  update(jobId: string, patch: Partial<CollectionJob>): Promise<CollectionJob | null>;
  list(filter?: { providerId?: string; limit?: number }): Promise<CollectionJob[]>;
}

export interface ProviderStateRepository {
  upsert(state: ProviderState): Promise<ProviderState>;
  get(providerId: string): Promise<ProviderState | null>;
  list(): Promise<ProviderState[]>;
}

export interface Repositories {
  users: UserRepository;
  instruments: InstrumentRepository;
  quotes: QuoteRepository;
  fxRates: FxRateRepository;
  portfolios: PortfolioRepository;
  transactions: TransactionRepository;
  snapshots: SnapshotRepository;
  signalRules: SignalRuleRepository;
  signalEvents: SignalEventRepository;
  collectionJobs: CollectionJobRepository;
  providerStates: ProviderStateRepository;
}
