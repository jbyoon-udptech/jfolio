import { randomUUID } from "node:crypto";
import type {
  CollectionJob,
  FxRate,
  Instrument,
  LatestQuote,
  MarketQuote,
  Portfolio,
  PortfolioSnapshot,
  ProviderState,
  SignalEvent,
  SignalRule,
  Transaction,
} from "@jfolio/shared";
import type { AuthProviderId } from "@jfolio/shared";
import type { User, UserIdentity } from "../../users/user.types";
import type { UserRepository } from "../../users/user.repository";
import type {
  CollectionJobRepository,
  FxRateQuery,
  FxRateRepository,
  HistoricalQuery,
  InstrumentFilter,
  InstrumentRepository,
  ListResult,
  PortfolioRepository,
  ProviderStateRepository,
  QuoteRepository,
  Repositories,
  SignalEventFilter,
  SignalEventRepository,
  SignalRuleRepository,
  SnapshotFilter,
  SnapshotRepository,
  TransactionFilter,
  TransactionRepository,
} from "../types";

const clone = <T>(value: T): T => structuredClone(value);
const byTimeAsc = (a: { timestamp: Date }, b: { timestamp: Date }) =>
  a.timestamp.getTime() - b.timestamp.getTime();

export class MemoryInstrumentRepository implements InstrumentRepository {
  private readonly store = new Map<string, Instrument>();

  async create(instrument: Instrument): Promise<Instrument> {
    this.store.set(instrument.instrumentId, clone(instrument));
    return clone(instrument);
  }

  async upsertByNaturalKey(instrument: Instrument): Promise<Instrument> {
    const existing = await this.findBySymbol(instrument.symbol, instrument.market, instrument.currency);
    if (existing) {
      const updated = { ...existing, ...instrument, instrumentId: existing.instrumentId };
      this.store.set(updated.instrumentId, clone(updated));
      return clone(updated);
    }
    return this.create(instrument);
  }

  async update(instrumentId: string, patch: Partial<Instrument>): Promise<Instrument | null> {
    const current = this.store.get(instrumentId);
    if (!current) return null;
    const next = { ...current, ...patch, instrumentId, updatedAt: new Date() };
    this.store.set(instrumentId, next);
    return clone(next);
  }

  async findById(instrumentId: string): Promise<Instrument | null> {
    const found = this.store.get(instrumentId);
    return found ? clone(found) : null;
  }

  async findBySymbol(symbol: string, market: string, currency: string): Promise<Instrument | null> {
    for (const item of this.store.values()) {
      if (item.symbol === symbol && item.market === market && item.currency === currency) {
        return clone(item);
      }
    }
    return null;
  }

  async findMany(ids: string[]): Promise<Instrument[]> {
    return ids.map((id) => this.store.get(id)).filter((i): i is Instrument => !!i).map(clone);
  }

  async list(filter: InstrumentFilter = {}): Promise<ListResult<Instrument>> {
    let items = [...this.store.values()];
    if (filter.assetType) items = items.filter((i) => i.assetType === filter.assetType);
    if (filter.market) items = items.filter((i) => i.market === filter.market);
    if (filter.currency) items = items.filter((i) => i.currency === filter.currency);
    if (filter.isActive !== undefined) items = items.filter((i) => i.isActive === filter.isActive);
    if (filter.isWatchlist !== undefined)
      items = items.filter((i) => i.isWatchlist === filter.isWatchlist);
    if (filter.search) {
      const needle = filter.search.toLowerCase();
      items = items.filter(
        (i) =>
          i.symbol.toLowerCase().includes(needle) || i.name.toLowerCase().includes(needle),
      );
    }
    items.sort((a, b) => a.symbol.localeCompare(b.symbol));
    const total = items.length;
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 200;
    return { items: items.slice(offset, offset + limit).map(clone), total };
  }

  async findActive(): Promise<Instrument[]> {
    return [...this.store.values()].filter((i) => i.isActive).map(clone);
  }
}

export class MemoryQuoteRepository implements QuoteRepository {
  private readonly quotes: MarketQuote[] = [];
  private readonly latest = new Map<string, LatestQuote>();
  private readonly keys = new Set<string>();

  private key(q: MarketQuote): string {
    return `${q.instrumentId}|${q.providerId}|${q.interval}|${q.timestamp.toISOString()}`;
  }

  async insertQuote(quote: MarketQuote): Promise<boolean> {
    const key = this.key(quote);
    const isNew = !this.keys.has(key);
    if (isNew) {
      this.keys.add(key);
      this.quotes.push(clone(quote));
    }
    // Refresh the materialised latest quote on every observation (mirrors the
    // Mongo repository), keeping the newest timestamp so a late-arriving older
    // quote cannot regress it.
    const current = this.latest.get(quote.instrumentId);
    if (!current || quote.timestamp.getTime() >= current.timestamp.getTime()) {
      this.latest.set(quote.instrumentId, { ...clone(quote) });
    }
    return isNew;
  }

  async insertQuotes(quotes: MarketQuote[]): Promise<{ inserted: number; duplicates: number }> {
    let inserted = 0;
    let duplicates = 0;
    for (const q of quotes) {
      if (await this.insertQuote(q)) inserted += 1;
      else duplicates += 1;
    }
    return { inserted, duplicates };
  }

  async getLatest(instrumentId: string): Promise<LatestQuote | null> {
    const found = this.latest.get(instrumentId);
    return found ? clone(found) : null;
  }

  async getLatestMany(instrumentIds: string[]): Promise<Map<string, LatestQuote>> {
    const result = new Map<string, LatestQuote>();
    for (const id of instrumentIds) {
      const found = this.latest.get(id);
      if (found) result.set(id, clone(found));
    }
    return result;
  }

  async getHistorical(instrumentId: string, query: HistoricalQuery = {}): Promise<MarketQuote[]> {
    let items = this.quotes.filter((q) => q.instrumentId === instrumentId);
    if (query.interval) items = items.filter((q) => q.interval === query.interval);
    if (query.from) items = items.filter((q) => q.timestamp >= query.from!);
    if (query.to) items = items.filter((q) => q.timestamp <= query.to!);
    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const limited = query.limit ? items.slice(0, query.limit) : items;
    return limited.map(clone);
  }

  async getLastBefore(
    instrumentId: string,
    before: Date,
    interval?: MarketQuote["interval"],
  ): Promise<MarketQuote | null> {
    let items = this.quotes.filter(
      (q) => q.instrumentId === instrumentId && q.timestamp < before,
    );
    if (interval) items = items.filter((q) => q.interval === interval);
    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const found = items[0];
    return found ? clone(found) : null;
  }
}

export class MemoryFxRateRepository implements FxRateRepository {
  private readonly rates: FxRate[] = [];

  async upsertRate(rate: FxRate): Promise<void> {
    const index = this.rates.findIndex(
      (r) =>
        r.base === rate.base &&
        r.quote === rate.quote &&
        r.timestamp.getTime() === rate.timestamp.getTime(),
    );
    if (index >= 0) this.rates[index] = clone(rate);
    else this.rates.push(clone(rate));
  }

  async getRate(base: string, quote: string, asOf: Date): Promise<FxRate | null> {
    const items = this.rates
      .filter((r) => r.base === base && r.quote === quote && r.timestamp <= asOf)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const found = items[0];
    return found ? clone(found) : null;
  }

  async getRates(base: string, quote: string, query: FxRateQuery = {}): Promise<FxRate[]> {
    const from = query.from;
    const to = query.to;
    let items = this.rates.filter((r) => r.base === base && r.quote === quote);
    if (from) items = items.filter((r) => r.timestamp >= from);
    if (to) items = items.filter((r) => r.timestamp <= to);
    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return items.slice(0, query.limit ?? 5000).map(clone);
  }

  async getLatest(base: string, quote: string): Promise<FxRate | null> {
    return this.getRate(base, quote, new Date(8.64e15));
  }

  async listLatest(): Promise<FxRate[]> {
    const seen = new Map<string, FxRate>();
    for (const rate of this.rates) {
      const key = `${rate.base}|${rate.quote}`;
      const current = seen.get(key);
      if (!current || rate.timestamp > current.timestamp) seen.set(key, rate);
    }
    return [...seen.values()].map(clone);
  }
}

export class MemoryPortfolioRepository implements PortfolioRepository {
  private readonly store = new Map<string, Portfolio>();

  async create(portfolio: Portfolio): Promise<Portfolio> {
    this.store.set(portfolio.portfolioId, clone(portfolio));
    return clone(portfolio);
  }

  async update(portfolioId: string, patch: Partial<Portfolio>): Promise<Portfolio | null> {
    const current = this.store.get(portfolioId);
    if (!current) return null;
    const next = { ...current, ...patch, portfolioId, updatedAt: new Date() };
    this.store.set(portfolioId, next);
    return clone(next);
  }

  async findById(portfolioId: string): Promise<Portfolio | null> {
    const found = this.store.get(portfolioId);
    return found ? clone(found) : null;
  }

  async list(userId?: string): Promise<Portfolio[]> {
    return [...this.store.values()]
      .filter((p) => (userId ? p.userId === userId : true))
      .map(clone);
  }

  async findDefault(userId: string): Promise<Portfolio | null> {
    for (const p of this.store.values()) {
      if (p.userId === userId && p.isDefault) return clone(p);
    }
    return null;
  }
}

export class MemoryTransactionRepository implements TransactionRepository {
  private readonly store = new Map<string, Transaction>();

  async create(transaction: Transaction): Promise<Transaction> {
    this.store.set(transaction.transactionId, clone(transaction));
    return clone(transaction);
  }

  async update(transactionId: string, patch: Partial<Transaction>): Promise<Transaction | null> {
    const current = this.store.get(transactionId);
    if (!current) return null;
    const next = { ...current, ...patch, transactionId, updatedAt: new Date() };
    this.store.set(transactionId, next);
    return clone(next);
  }

  async delete(transactionId: string): Promise<boolean> {
    return this.store.delete(transactionId);
  }

  async findById(transactionId: string): Promise<Transaction | null> {
    const found = this.store.get(transactionId);
    return found ? clone(found) : null;
  }

  async list(filter: TransactionFilter = {}): Promise<ListResult<Transaction>> {
    let items = [...this.store.values()];
    if (filter.portfolioId) items = items.filter((t) => t.portfolioId === filter.portfolioId);
    if (filter.instrumentId) items = items.filter((t) => t.instrumentId === filter.instrumentId);
    if (filter.type) items = items.filter((t) => t.type === filter.type);
    if (filter.from) items = items.filter((t) => t.timestamp >= filter.from!);
    if (filter.to) items = items.filter((t) => t.timestamp <= filter.to!);
    items.sort(byTimeAsc);
    const total = items.length;
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 200;
    return { items: items.slice(offset, offset + limit).map(clone), total };
  }

  async listByPortfolio(portfolioId: string, to?: Date): Promise<Transaction[]> {
    return [...this.store.values()]
      .filter((t) => t.portfolioId === portfolioId && (!to || t.timestamp <= to))
      .sort(byTimeAsc)
      .map(clone);
  }
}

export class MemorySnapshotRepository implements SnapshotRepository {
  private readonly store = new Map<string, PortfolioSnapshot>();
  private readonly keys = new Map<string, string>();

  private key(s: PortfolioSnapshot): string {
    return `${s.portfolioId}|${s.snapshotType}|${s.asOf.toISOString()}`;
  }

  async upsert(snapshot: PortfolioSnapshot): Promise<PortfolioSnapshot> {
    const key = this.key(snapshot);
    const existingId = this.keys.get(key);
    const id = existingId ?? snapshot.snapshotId;
    const stored: PortfolioSnapshot = { ...clone(snapshot), snapshotId: id };
    this.store.set(id, stored);
    this.keys.set(key, id);
    return clone(stored);
  }

  async findById(snapshotId: string): Promise<PortfolioSnapshot | null> {
    const found = this.store.get(snapshotId);
    return found ? clone(found) : null;
  }

  async list(portfolioId: string, filter: SnapshotFilter = {}): Promise<PortfolioSnapshot[]> {
    let items = [...this.store.values()].filter((s) => s.portfolioId === portfolioId);
    if (filter.snapshotType) items = items.filter((s) => s.snapshotType === filter.snapshotType);
    if (filter.from) items = items.filter((s) => s.asOf >= filter.from!);
    if (filter.to) items = items.filter((s) => s.asOf <= filter.to!);
    items.sort((a, b) => a.asOf.getTime() - b.asOf.getTime());
    if (filter.limit) items = items.slice(-filter.limit);
    return items.map(clone);
  }

  async deleteAfter(portfolioId: string, asOf: Date): Promise<number> {
    let removed = 0;
    for (const [id, snapshot] of [...this.store.entries()]) {
      if (snapshot.portfolioId === portfolioId && snapshot.asOf >= asOf) {
        this.store.delete(id);
        this.keys.delete(this.key(snapshot));
        removed += 1;
      }
    }
    return removed;
  }
}

export class MemorySignalRuleRepository implements SignalRuleRepository {
  private readonly store = new Map<string, SignalRule>();

  async create(rule: SignalRule): Promise<SignalRule> {
    this.store.set(rule.ruleId, clone(rule));
    return clone(rule);
  }

  async update(ruleId: string, patch: Partial<SignalRule>): Promise<SignalRule | null> {
    const current = this.store.get(ruleId);
    if (!current) return null;
    const next = { ...current, ...patch, ruleId, updatedAt: new Date() };
    this.store.set(ruleId, next);
    return clone(next);
  }

  async findById(ruleId: string): Promise<SignalRule | null> {
    const found = this.store.get(ruleId);
    return found ? clone(found) : null;
  }

  async list(filter: { portfolioId?: string; instrumentId?: string; isEnabled?: boolean } = {}) {
    return [...this.store.values()]
      .filter((r) => (filter.portfolioId ? r.portfolioId === filter.portfolioId : true))
      .filter((r) => (filter.instrumentId ? r.instrumentId === filter.instrumentId : true))
      .filter((r) => (filter.isEnabled !== undefined ? r.isEnabled === filter.isEnabled : true))
      .map(clone);
  }

  async findEnabled(): Promise<SignalRule[]> {
    return [...this.store.values()].filter((r) => r.isEnabled).map(clone);
  }

  async findByInstrument(instrumentId: string): Promise<SignalRule[]> {
    return [...this.store.values()].filter((r) => r.instrumentId === instrumentId).map(clone);
  }
}

export class MemorySignalEventRepository implements SignalEventRepository {
  private readonly events: SignalEvent[] = [];
  private readonly keys = new Set<string>();

  async insert(event: SignalEvent): Promise<boolean> {
    const key = `${event.ruleId}|${event.deduplicationKey}`;
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    this.events.push(clone(event));
    return true;
  }

  async list(filter: SignalEventFilter = {}): Promise<ListResult<SignalEvent>> {
    let items = [...this.events];
    if (filter.ruleId) items = items.filter((e) => e.ruleId === filter.ruleId);
    if (filter.instrumentId) items = items.filter((e) => e.instrumentId === filter.instrumentId);
    if (filter.portfolioId) items = items.filter((e) => e.portfolioId === filter.portfolioId);
    if (filter.status) items = items.filter((e) => e.status === filter.status);
    if (filter.from) items = items.filter((e) => e.triggeredAt >= filter.from!);
    if (filter.to) items = items.filter((e) => e.triggeredAt <= filter.to!);
    items.sort((a, b) => b.triggeredAt.getTime() - a.triggeredAt.getTime());
    const total = items.length;
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 100;
    return { items: items.slice(offset, offset + limit).map(clone), total };
  }

  async countByRule(ruleId: string): Promise<number> {
    return this.events.filter((e) => e.ruleId === ruleId).length;
  }
}

export class MemoryCollectionJobRepository implements CollectionJobRepository {
  private readonly store = new Map<string, CollectionJob>();

  async create(job: CollectionJob): Promise<CollectionJob> {
    this.store.set(job.jobId, clone(job));
    return clone(job);
  }

  async update(jobId: string, patch: Partial<CollectionJob>): Promise<CollectionJob | null> {
    const current = this.store.get(jobId);
    if (!current) return null;
    const next = { ...current, ...patch, jobId };
    this.store.set(jobId, next);
    return clone(next);
  }

  async list(filter: { providerId?: string; limit?: number } = {}): Promise<CollectionJob[]> {
    let items = [...this.store.values()];
    if (filter.providerId) items = items.filter((j) => j.providerId === filter.providerId);
    items.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    if (filter.limit) items = items.slice(0, filter.limit);
    return items.map(clone);
  }
}

export class MemoryProviderStateRepository implements ProviderStateRepository {
  private readonly store = new Map<string, ProviderState>();

  async upsert(state: ProviderState): Promise<ProviderState> {
    this.store.set(state.providerId, clone(state));
    return clone(state);
  }

  async get(providerId: string): Promise<ProviderState | null> {
    const found = this.store.get(providerId);
    return found ? clone(found) : null;
  }

  async list(): Promise<ProviderState[]> {
    return [...this.store.values()].map(clone);
  }
}

export class MemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();
  private readonly identities = new Map<string, UserIdentity>();

  private identityKey(provider: AuthProviderId, providerUserId: string): string {
    return `${provider}|${providerUserId}`;
  }

  async create(user: User): Promise<User> {
    for (const existing of this.users.values()) {
      if (existing.email === user.email) throw duplicateKey();
    }
    this.users.set(user.userId, clone(user));
    return clone(user);
  }

  async update(userId: string, patch: Partial<User>): Promise<User | null> {
    const current = this.users.get(userId);
    if (!current) return null;
    if (patch.email && patch.email !== current.email) {
      for (const existing of this.users.values()) {
        if (existing.userId !== userId && existing.email === patch.email) throw duplicateKey();
      }
    }
    const next: User = { ...current, ...patch, userId, updatedAt: new Date() };
    this.users.set(userId, next);
    return clone(next);
  }

  async findById(userId: string): Promise<User | null> {
    const found = this.users.get(userId);
    return found ? clone(found) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.email === email) return clone(user);
    }
    return null;
  }

  async createIdentity(identity: UserIdentity): Promise<UserIdentity> {
    const external = this.identityKey(identity.provider, identity.providerUserId);
    for (const existing of this.identities.values()) {
      if (this.identityKey(existing.provider, existing.providerUserId) === external) {
        throw duplicateKey();
      }
      if (existing.userId === identity.userId && existing.provider === identity.provider) {
        throw duplicateKey();
      }
    }
    this.identities.set(identity.identityId, clone(identity));
    return clone(identity);
  }

  async findIdentity(
    provider: AuthProviderId,
    providerUserId: string,
  ): Promise<UserIdentity | null> {
    for (const identity of this.identities.values()) {
      if (
        identity.provider === provider &&
        identity.providerUserId === providerUserId
      ) {
        return clone(identity);
      }
    }
    return null;
  }

  async findIdentityForUser(
    userId: string,
    provider: AuthProviderId,
  ): Promise<UserIdentity | null> {
    for (const identity of this.identities.values()) {
      if (identity.userId === userId && identity.provider === provider) return clone(identity);
    }
    return null;
  }
}

function duplicateKey(): Error {
  return Object.assign(new Error("Duplicate key"), { code: 11000 });
}

export function createMemoryRepositories(): Repositories {
  return {
    users: new MemoryUserRepository(),
    instruments: new MemoryInstrumentRepository(),
    quotes: new MemoryQuoteRepository(),
    fxRates: new MemoryFxRateRepository(),
    portfolios: new MemoryPortfolioRepository(),
    transactions: new MemoryTransactionRepository(),
    snapshots: new MemorySnapshotRepository(),
    signalRules: new MemorySignalRuleRepository(),
    signalEvents: new MemorySignalEventRepository(),
    collectionJobs: new MemoryCollectionJobRepository(),
    providerStates: new MemoryProviderStateRepository(),
  };
}

export { randomUUID };
