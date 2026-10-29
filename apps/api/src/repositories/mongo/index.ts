import type { Collection, Db, Filter } from "mongodb";
import type {
  AuthProviderId,
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
import { COLLECTIONS } from "../../db/collections";
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

const NO_ID = { projection: { _id: 0 } } as const;

function stripId<T>(doc: unknown): T {
  if (doc && typeof doc === "object" && "_id" in doc) {
    const { _id, ...rest } = doc as Record<string, unknown>;
    void _id;
    return rest as T;
  }
  return doc as T;
}

class MongoUserRepository implements UserRepository {
  constructor(
    private readonly users: Collection<User>,
    private readonly identities: Collection<UserIdentity>,
  ) {}

  async create(user: User): Promise<User> {
    await this.users.insertOne({ ...user });
    return user;
  }

  async update(userId: string, patch: Partial<User>): Promise<User | null> {
    const result = await this.users.findOneAndUpdate(
      { userId },
      { $set: { ...patch, userId, updatedAt: new Date() } },
      { returnDocument: "after", projection: { _id: 0 } },
    );
    return result ? stripId<User>(result) : null;
  }

  async findById(userId: string): Promise<User | null> {
    const doc = await this.users.findOne({ userId }, NO_ID);
    return doc ? stripId<User>(doc) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const doc = await this.users.findOne({ email }, NO_ID);
    return doc ? stripId<User>(doc) : null;
  }

  async createIdentity(identity: UserIdentity): Promise<UserIdentity> {
    await this.identities.insertOne({ ...identity });
    return identity;
  }

  async findIdentity(
    provider: AuthProviderId,
    providerUserId: string,
  ): Promise<UserIdentity | null> {
    const doc = await this.identities.findOne({ provider, providerUserId }, NO_ID);
    return doc ? stripId<UserIdentity>(doc) : null;
  }

  async findIdentityForUser(
    userId: string,
    provider: AuthProviderId,
  ): Promise<UserIdentity | null> {
    const doc = await this.identities.findOne({ userId, provider }, NO_ID);
    return doc ? stripId<UserIdentity>(doc) : null;
  }
}

class MongoInstrumentRepository implements InstrumentRepository {
  constructor(private readonly col: Collection<Instrument>) {}

  async create(instrument: Instrument): Promise<Instrument> {
    await this.col.insertOne({ ...instrument });
    return instrument;
  }

  async upsertByNaturalKey(instrument: Instrument): Promise<Instrument> {
    const existing = await this.findBySymbol(instrument.symbol, instrument.market, instrument.currency);
    if (existing) {
      const merged = { ...existing, ...instrument, instrumentId: existing.instrumentId };
      await this.col.replaceOne({ instrumentId: existing.instrumentId }, merged);
      return merged;
    }
    return this.create(instrument);
  }

  async update(instrumentId: string, patch: Partial<Instrument>): Promise<Instrument | null> {
    const updatedAt = new Date();
    const result = await this.col.findOneAndUpdate(
      { instrumentId },
      { $set: { ...patch, updatedAt } },
      { returnDocument: "after", projection: { _id: 0 } },
    );
    return result ? (stripId<Instrument>(result) as Instrument) : null;
  }

  async findById(instrumentId: string): Promise<Instrument | null> {
    const doc = await this.col.findOne({ instrumentId }, NO_ID);
    return doc ? stripId<Instrument>(doc) : null;
  }

  async findBySymbol(symbol: string, market: string, currency: string): Promise<Instrument | null> {
    const doc = await this.col.findOne({ symbol, market, currency }, NO_ID);
    return doc ? stripId<Instrument>(doc) : null;
  }

  async findMany(ids: string[]): Promise<Instrument[]> {
    if (ids.length === 0) return [];
    const docs = await this.col.find({ instrumentId: { $in: ids } }, NO_ID).toArray();
    return docs.map((d) => stripId<Instrument>(d));
  }

  async list(filter: InstrumentFilter = {}): Promise<ListResult<Instrument>> {
    const query: Filter<Instrument> = {};
    if (filter.assetType) query.assetType = filter.assetType as Instrument["assetType"];
    if (filter.market) query.market = filter.market;
    if (filter.currency) query.currency = filter.currency;
    if (filter.isActive !== undefined) query.isActive = filter.isActive;
    if (filter.isWatchlist !== undefined) query.isWatchlist = filter.isWatchlist;
    if (filter.search) {
      query.$or = [
        { symbol: { $regex: filter.search, $options: "i" } },
        { name: { $regex: filter.search, $options: "i" } },
      ];
    }
    const limit = filter.limit ?? 200;
    const offset = filter.offset ?? 0;
    const [docs, total] = await Promise.all([
      this.col.find(query, NO_ID).sort({ symbol: 1 }).skip(offset).limit(limit).toArray(),
      this.col.countDocuments(query),
    ]);
    return { items: docs.map((d) => stripId<Instrument>(d)), total };
  }

  async findActive(): Promise<Instrument[]> {
    const docs = await this.col.find({ isActive: true }, NO_ID).toArray();
    return docs.map((d) => stripId<Instrument>(d));
  }
}

class MongoQuoteRepository implements QuoteRepository {
  constructor(
    private readonly quotes: Collection<MarketQuote>,
    private readonly latest: Collection<LatestQuote>,
  ) {}

  private logicalFilter(q: MarketQuote) {
    return {
      instrumentId: q.instrumentId,
      providerId: q.providerId,
      interval: q.interval,
      timestamp: q.timestamp,
    };
  }

  async insertQuote(quote: MarketQuote): Promise<boolean> {
    const result = await this.quotes.updateOne(
      this.logicalFilter(quote),
      { $setOnInsert: { ...quote } },
      { upsert: true },
    );
    const inserted = result.upsertedCount === 1;
    // Refresh the materialised latest quote on every observation so a repeated
    // collection run keeps the "latest" view current even when the raw row is a
    // duplicate. The timestamp guard stops a late-arriving older quote (e.g. a
    // historical backfill) from regressing the latest value.
    await this.refreshLatest(quote);
    return inserted;
  }

  /**
   * Upsert the materialised latest quote, keeping the newest timestamp. The
   * unique index on instrumentId guarantees a single document per instrument,
   * so we first attempt a guarded update and only insert when none exists yet
   * (a filtered upsert would risk a duplicate-key error when a newer quote is
   * already stored).
   */
  private async refreshLatest(quote: MarketQuote): Promise<void> {
    const updated = await this.latest.updateOne(
      { instrumentId: quote.instrumentId, timestamp: { $lte: quote.timestamp } },
      { $set: { ...quote } },
    );
    if (updated.matchedCount > 0) return;
    await this.latest.updateOne(
      { instrumentId: quote.instrumentId },
      { $setOnInsert: { ...quote } },
      { upsert: true },
    );
  }

  async insertQuotes(quotes: MarketQuote[]): Promise<{ inserted: number; duplicates: number }> {
    let inserted = 0;
    let duplicates = 0;
    for (const quote of quotes) {
      if (await this.insertQuote(quote)) inserted += 1;
      else duplicates += 1;
    }
    return { inserted, duplicates };
  }

  async getLatest(instrumentId: string): Promise<LatestQuote | null> {
    const doc = await this.latest.findOne({ instrumentId }, NO_ID);
    return doc ? stripId<LatestQuote>(doc) : null;
  }

  async getLatestMany(instrumentIds: string[]): Promise<Map<string, LatestQuote>> {
    const result = new Map<string, LatestQuote>();
    if (instrumentIds.length === 0) return result;
    const docs = await this.latest.find({ instrumentId: { $in: instrumentIds } }, NO_ID).toArray();
    for (const doc of docs) {
      const quote = stripId<LatestQuote>(doc);
      result.set(quote.instrumentId, quote);
    }
    return result;
  }

  async getEarliest(
    instrumentIds: string[],
    interval?: MarketQuote["interval"],
  ): Promise<MarketQuote | null> {
    if (instrumentIds.length === 0) return null;
    const filter: Filter<MarketQuote> = { instrumentId: { $in: instrumentIds } };
    if (interval) filter.interval = interval;
    const doc = await this.quotes.find(filter, NO_ID).sort({ timestamp: 1 }).limit(1).next();
    return doc ? stripId<MarketQuote>(doc) : null;
  }

  async getHistorical(instrumentId: string, query: HistoricalQuery = {}): Promise<MarketQuote[]> {
    const filter: Filter<MarketQuote> = { instrumentId };
    if (query.interval) filter.interval = query.interval;
    if (query.from || query.to) {
      filter.timestamp = {};
      if (query.from) filter.timestamp.$gte = query.from;
      if (query.to) filter.timestamp.$lte = query.to;
    }
    const limit = query.limit ?? 500;
    const docs = await this.quotes.find(filter, NO_ID).sort({ timestamp: -1 }).limit(limit).toArray();
    return docs.map((d) => stripId<MarketQuote>(d));
  }

  async getLastBefore(
    instrumentId: string,
    before: Date,
    interval?: MarketQuote["interval"],
  ): Promise<MarketQuote | null> {
    const filter: Filter<MarketQuote> = { instrumentId, timestamp: { $lt: before } };
    if (interval) filter.interval = interval;
    const doc = await this.quotes.find(filter, NO_ID).sort({ timestamp: -1 }).limit(1).next();
    return doc ? stripId<MarketQuote>(doc) : null;
  }
}

class MongoFxRateRepository implements FxRateRepository {
  constructor(private readonly col: Collection<FxRate>) {}

  async upsertRate(rate: FxRate): Promise<void> {
    await this.col.updateOne(
      { base: rate.base, quote: rate.quote, timestamp: rate.timestamp },
      { $set: { ...rate } },
      { upsert: true },
    );
  }

  async getRate(base: string, quote: string, asOf: Date): Promise<FxRate | null> {
    const doc = await this.col
      .find({ base, quote, timestamp: { $lte: asOf } }, NO_ID)
      .sort({ timestamp: -1 })
      .limit(1)
      .next();
    return doc ? stripId<FxRate>(doc) : null;
  }

  async getRates(base: string, quote: string, query: FxRateQuery = {}): Promise<FxRate[]> {
    const filter: Filter<FxRate> = { base, quote };
    if (query.from || query.to) {
      filter.timestamp = {};
      if (query.from) filter.timestamp.$gte = query.from;
      if (query.to) filter.timestamp.$lte = query.to;
    }
    const docs = await this.col
      .find(filter, NO_ID)
      .sort({ timestamp: -1 })
      .limit(query.limit ?? 5000)
      .toArray();
    return docs.map((d) => stripId<FxRate>(d));
  }

  async getLatest(base: string, quote: string): Promise<FxRate | null> {
    const doc = await this.col
      .find({ base, quote }, NO_ID)
      .sort({ timestamp: -1 })
      .limit(1)
      .next();
    return doc ? stripId<FxRate>(doc) : null;
  }

  async listLatest(): Promise<FxRate[]> {
    const docs = await this.col
      .aggregate<FxRate>([
        { $sort: { base: 1, quote: 1, timestamp: -1 } },
        {
          $group: {
            _id: { base: "$base", quote: "$quote" },
            doc: { $first: "$$ROOT" },
          },
        },
        { $replaceRoot: { newRoot: "$doc" } },
        { $project: { _id: 0 } },
      ])
      .toArray();
    return docs.map((d) => stripId<FxRate>(d));
  }
}

class MongoPortfolioRepository implements PortfolioRepository {
  constructor(private readonly col: Collection<Portfolio>) {}

  async create(portfolio: Portfolio): Promise<Portfolio> {
    await this.col.insertOne({ ...portfolio });
    return portfolio;
  }

  async update(portfolioId: string, patch: Partial<Portfolio>): Promise<Portfolio | null> {
    const result = await this.col.findOneAndUpdate(
      { portfolioId },
      { $set: { ...patch, updatedAt: new Date() } },
      { returnDocument: "after", projection: { _id: 0 } },
    );
    return result ? stripId<Portfolio>(result) : null;
  }

  async findById(portfolioId: string): Promise<Portfolio | null> {
    const doc = await this.col.findOne({ portfolioId }, NO_ID);
    return doc ? stripId<Portfolio>(doc) : null;
  }

  async list(userId?: string): Promise<Portfolio[]> {
    const filter = userId ? { userId } : {};
    const docs = await this.col.find(filter, NO_ID).toArray();
    return docs.map((d) => stripId<Portfolio>(d));
  }

  async findDefault(userId: string): Promise<Portfolio | null> {
    const doc = await this.col.findOne({ userId, isDefault: true }, NO_ID);
    return doc ? stripId<Portfolio>(doc) : null;
  }
}

class MongoTransactionRepository implements TransactionRepository {
  constructor(private readonly col: Collection<Transaction>) {}

  async create(transaction: Transaction): Promise<Transaction> {
    await this.col.insertOne({ ...transaction });
    return transaction;
  }

  async update(transactionId: string, patch: Partial<Transaction>): Promise<Transaction | null> {
    const result = await this.col.findOneAndUpdate(
      { transactionId },
      { $set: { ...patch, updatedAt: new Date() } },
      { returnDocument: "after", projection: { _id: 0 } },
    );
    return result ? stripId<Transaction>(result) : null;
  }

  async delete(transactionId: string): Promise<boolean> {
    const result = await this.col.deleteOne({ transactionId });
    return result.deletedCount === 1;
  }

  async findById(transactionId: string): Promise<Transaction | null> {
    const doc = await this.col.findOne({ transactionId }, NO_ID);
    return doc ? stripId<Transaction>(doc) : null;
  }

  async list(filter: TransactionFilter = {}): Promise<ListResult<Transaction>> {
    const query: Filter<Transaction> = {};
    if (filter.portfolioId) query.portfolioId = filter.portfolioId;
    if (filter.instrumentId) query.instrumentId = filter.instrumentId;
    if (filter.type) query.type = filter.type as Transaction["type"];
    if (filter.from || filter.to) {
      query.timestamp = {};
      if (filter.from) query.timestamp.$gte = filter.from;
      if (filter.to) query.timestamp.$lte = filter.to;
    }
    const limit = filter.limit ?? 200;
    const offset = filter.offset ?? 0;
    const [docs, total] = await Promise.all([
      this.col.find(query, NO_ID).sort({ timestamp: 1 }).skip(offset).limit(limit).toArray(),
      this.col.countDocuments(query),
    ]);
    return { items: docs.map((d) => stripId<Transaction>(d)), total };
  }

  async listByPortfolio(portfolioId: string, to?: Date): Promise<Transaction[]> {
    const query: Filter<Transaction> = { portfolioId };
    if (to) query.timestamp = { $lte: to };
    const docs = await this.col.find(query, NO_ID).sort({ timestamp: 1 }).toArray();
    return docs.map((d) => stripId<Transaction>(d));
  }
}

class MongoSnapshotRepository implements SnapshotRepository {
  constructor(private readonly col: Collection<PortfolioSnapshot>) {}

  async upsert(snapshot: PortfolioSnapshot): Promise<PortfolioSnapshot> {
    const result = await this.col.findOneAndUpdate(
      {
        portfolioId: snapshot.portfolioId,
        snapshotType: snapshot.snapshotType,
        asOf: snapshot.asOf,
      },
      { $set: { ...snapshot } },
      { upsert: true, returnDocument: "after", projection: { _id: 0 } },
    );
    return stripId<PortfolioSnapshot>(result) ?? snapshot;
  }

  async findById(snapshotId: string): Promise<PortfolioSnapshot | null> {
    const doc = await this.col.findOne({ snapshotId }, NO_ID);
    return doc ? stripId<PortfolioSnapshot>(doc) : null;
  }

  async list(portfolioId: string, filter: SnapshotFilter = {}): Promise<PortfolioSnapshot[]> {
    const query: Filter<PortfolioSnapshot> = { portfolioId };
    if (filter.snapshotType) query.snapshotType = filter.snapshotType;
    if (filter.from || filter.to) {
      query.asOf = {};
      if (filter.from) query.asOf.$gte = filter.from;
      if (filter.to) query.asOf.$lte = filter.to;
    }
    const limit = filter.limit ?? 2000;
    const docs = await this.col.find(query, NO_ID).sort({ asOf: 1 }).limit(limit).toArray();
    return docs.map((d) => stripId<PortfolioSnapshot>(d));
  }

  async deleteAfter(portfolioId: string, asOf: Date): Promise<number> {
    const result = await this.col.deleteMany({ portfolioId, asOf: { $gte: asOf } });
    return result.deletedCount;
  }
}

class MongoSignalRuleRepository implements SignalRuleRepository {
  constructor(private readonly col: Collection<SignalRule>) {}

  async create(rule: SignalRule): Promise<SignalRule> {
    await this.col.insertOne({ ...rule });
    return rule;
  }

  async update(ruleId: string, patch: Partial<SignalRule>): Promise<SignalRule | null> {
    const result = await this.col.findOneAndUpdate(
      { ruleId },
      { $set: { ...patch, updatedAt: new Date() } },
      { returnDocument: "after", projection: { _id: 0 } },
    );
    return result ? stripId<SignalRule>(result) : null;
  }

  async findById(ruleId: string): Promise<SignalRule | null> {
    const doc = await this.col.findOne({ ruleId }, NO_ID);
    return doc ? stripId<SignalRule>(doc) : null;
  }

  async list(filter: { portfolioId?: string; instrumentId?: string; isEnabled?: boolean } = {}) {
    const query: Filter<SignalRule> = {};
    if (filter.portfolioId) query.portfolioId = filter.portfolioId;
    if (filter.instrumentId) query.instrumentId = filter.instrumentId;
    if (filter.isEnabled !== undefined) query.isEnabled = filter.isEnabled;
    const docs = await this.col.find(query, NO_ID).toArray();
    return docs.map((d) => stripId<SignalRule>(d));
  }

  async findEnabled(): Promise<SignalRule[]> {
    const docs = await this.col.find({ isEnabled: true }, NO_ID).toArray();
    return docs.map((d) => stripId<SignalRule>(d));
  }

  async findByInstrument(instrumentId: string): Promise<SignalRule[]> {
    const docs = await this.col.find({ instrumentId }, NO_ID).toArray();
    return docs.map((d) => stripId<SignalRule>(d));
  }
}

class MongoSignalEventRepository implements SignalEventRepository {
  constructor(private readonly col: Collection<SignalEvent>) {}

  async insert(event: SignalEvent): Promise<boolean> {
    const result = await this.col.updateOne(
      { ruleId: event.ruleId, deduplicationKey: event.deduplicationKey },
      { $setOnInsert: { ...event } },
      { upsert: true },
    );
    return result.upsertedCount === 1;
  }

  async list(filter: SignalEventFilter = {}): Promise<ListResult<SignalEvent>> {
    const query: Filter<SignalEvent> = {};
    if (filter.ruleId) query.ruleId = filter.ruleId;
    if (filter.instrumentId) query.instrumentId = filter.instrumentId;
    if (filter.portfolioId) query.portfolioId = filter.portfolioId;
    if (filter.status) query.status = filter.status as SignalEvent["status"];
    if (filter.from || filter.to) {
      query.triggeredAt = {};
      if (filter.from) query.triggeredAt.$gte = filter.from;
      if (filter.to) query.triggeredAt.$lte = filter.to;
    }
    const limit = filter.limit ?? 100;
    const offset = filter.offset ?? 0;
    const [docs, total] = await Promise.all([
      this.col.find(query, NO_ID).sort({ triggeredAt: -1 }).skip(offset).limit(limit).toArray(),
      this.col.countDocuments(query),
    ]);
    return { items: docs.map((d) => stripId<SignalEvent>(d)), total };
  }

  async countByRule(ruleId: string): Promise<number> {
    return this.col.countDocuments({ ruleId });
  }
}

class MongoCollectionJobRepository implements CollectionJobRepository {
  constructor(private readonly col: Collection<CollectionJob>) {}

  async create(job: CollectionJob): Promise<CollectionJob> {
    await this.col.insertOne({ ...job });
    return job;
  }

  async update(jobId: string, patch: Partial<CollectionJob>): Promise<CollectionJob | null> {
    const result = await this.col.findOneAndUpdate(
      { jobId },
      { $set: { ...patch } },
      { returnDocument: "after", projection: { _id: 0 } },
    );
    return result ? stripId<CollectionJob>(result) : null;
  }

  async list(filter: { providerId?: string; limit?: number } = {}): Promise<CollectionJob[]> {
    const query = filter.providerId ? { providerId: filter.providerId } : {};
    const docs = await this.col
      .find(query, NO_ID)
      .sort({ startedAt: -1 })
      .limit(filter.limit ?? 100)
      .toArray();
    return docs.map((d) => stripId<CollectionJob>(d));
  }
}

class MongoProviderStateRepository implements ProviderStateRepository {
  constructor(private readonly col: Collection<ProviderState>) {}

  async upsert(state: ProviderState): Promise<ProviderState> {
    const result = await this.col.findOneAndUpdate(
      { providerId: state.providerId },
      { $set: { ...state } },
      { upsert: true, returnDocument: "after", projection: { _id: 0 } },
    );
    return stripId<ProviderState>(result) ?? state;
  }

  async get(providerId: string): Promise<ProviderState | null> {
    const doc = await this.col.findOne({ providerId }, NO_ID);
    return doc ? stripId<ProviderState>(doc) : null;
  }

  async list(): Promise<ProviderState[]> {
    const docs = await this.col.find({}, NO_ID).toArray();
    return docs.map((d) => stripId<ProviderState>(d));
  }
}

export function createMongoRepositories(db: Db): Repositories {
  return {
    users: new MongoUserRepository(
      db.collection<User>(COLLECTIONS.users),
      db.collection<UserIdentity>(COLLECTIONS.userIdentities),
    ),
    instruments: new MongoInstrumentRepository(db.collection<Instrument>(COLLECTIONS.instruments)),
    quotes: new MongoQuoteRepository(
      db.collection<MarketQuote>(COLLECTIONS.marketQuotes),
      db.collection<LatestQuote>(COLLECTIONS.latestQuotes),
    ),
    fxRates: new MongoFxRateRepository(db.collection<FxRate>(COLLECTIONS.fxRates)),
    portfolios: new MongoPortfolioRepository(db.collection<Portfolio>(COLLECTIONS.portfolios)),
    transactions: new MongoTransactionRepository(
      db.collection<Transaction>(COLLECTIONS.transactions),
    ),
    snapshots: new MongoSnapshotRepository(
      db.collection<PortfolioSnapshot>(COLLECTIONS.snapshots),
    ),
    signalRules: new MongoSignalRuleRepository(db.collection<SignalRule>(COLLECTIONS.signalRules)),
    signalEvents: new MongoSignalEventRepository(
      db.collection<SignalEvent>(COLLECTIONS.signalEvents),
    ),
    collectionJobs: new MongoCollectionJobRepository(
      db.collection<CollectionJob>(COLLECTIONS.collectionJobs),
    ),
    providerStates: new MongoProviderStateRepository(
      db.collection<ProviderState>(COLLECTIONS.providerStates),
    ),
  };
}
