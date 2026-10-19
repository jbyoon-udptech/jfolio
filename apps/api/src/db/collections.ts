import type { Db, IndexSpecification } from "mongodb";

export const COLLECTIONS = {
  users: "users",
  userIdentities: "user_identities",
  sessions: "sessions",
  instruments: "instruments",
  marketQuotes: "market_quotes",
  latestQuotes: "latest_quotes",
  fxRates: "fx_rates",
  portfolios: "portfolios",
  transactions: "transactions",
  positions: "positions",
  snapshots: "portfolio_snapshots",
  signalRules: "signal_rules",
  signalEvents: "signal_events",
  collectionJobs: "collection_jobs",
  providerStates: "provider_states",
} as const;

interface IndexDefinition {
  collection: string;
  keys: IndexSpecification;
  options?: { unique?: boolean; name?: string; sparse?: boolean };
}

/** SPEC 9.5 index design. */
export const INDEX_DEFINITIONS: IndexDefinition[] = [
  {
    collection: COLLECTIONS.users,
    keys: { email: 1 },
    options: { unique: true, name: "uniq_user_email" },
  },
  {
    collection: COLLECTIONS.userIdentities,
    keys: { provider: 1, providerUserId: 1 },
    options: { unique: true, name: "uniq_identity_provider_user" },
  },
  {
    collection: COLLECTIONS.userIdentities,
    keys: { userId: 1, provider: 1 },
    options: { unique: true, name: "uniq_identity_user_provider" },
  },
  {
    collection: COLLECTIONS.instruments,
    keys: { symbol: 1, market: 1, currency: 1 },
    options: { unique: true, name: "uniq_symbol_market_currency" },
  },
  { collection: COLLECTIONS.instruments, keys: { assetType: 1, isActive: 1 } },
  {
    collection: COLLECTIONS.marketQuotes,
    keys: { instrumentId: 1, providerId: 1, interval: 1, timestamp: 1 },
    options: { unique: true, name: "uniq_quote_logical_key" },
  },
  { collection: COLLECTIONS.marketQuotes, keys: { instrumentId: 1, interval: 1, timestamp: -1 } },
  {
    collection: COLLECTIONS.latestQuotes,
    keys: { instrumentId: 1 },
    options: { unique: true, name: "uniq_latest_instrument" },
  },
  {
    collection: COLLECTIONS.fxRates,
    keys: { base: 1, quote: 1, timestamp: 1 },
    options: { unique: true, name: "uniq_fx_logical_key" },
  },
  { collection: COLLECTIONS.fxRates, keys: { base: 1, quote: 1, timestamp: -1 } },
  { collection: COLLECTIONS.portfolios, keys: { userId: 1, isDefault: 1 } },
  { collection: COLLECTIONS.transactions, keys: { portfolioId: 1, timestamp: 1 } },
  { collection: COLLECTIONS.transactions, keys: { instrumentId: 1, timestamp: 1 } },
  {
    collection: COLLECTIONS.positions,
    keys: { portfolioId: 1, instrumentId: 1 },
    options: { unique: true, name: "uniq_position" },
  },
  {
    collection: COLLECTIONS.snapshots,
    keys: { portfolioId: 1, snapshotType: 1, asOf: 1 },
    options: { unique: true, name: "uniq_snapshot" },
  },
  { collection: COLLECTIONS.signalRules, keys: { portfolioId: 1, isEnabled: 1 } },
  { collection: COLLECTIONS.signalRules, keys: { instrumentId: 1, isEnabled: 1 } },
  {
    collection: COLLECTIONS.signalEvents,
    keys: { ruleId: 1, deduplicationKey: 1 },
    options: { unique: true, name: "uniq_signal_event" },
  },
  { collection: COLLECTIONS.signalEvents, keys: { instrumentId: 1, triggeredAt: -1 } },
  { collection: COLLECTIONS.collectionJobs, keys: { providerId: 1, startedAt: -1 } },
  {
    collection: COLLECTIONS.providerStates,
    keys: { providerId: 1 },
    options: { unique: true, name: "uniq_provider_state" },
  },
];

export async function ensureIndexes(db: Db): Promise<void> {
  for (const def of INDEX_DEFINITIONS) {
    await db
      .collection(def.collection)
      .createIndex(def.keys, def.options ?? {})
      .catch((error) => {
        // Index creation is best-effort: log and continue so one bad index does
        // not prevent the API from starting.
        // eslint-disable-next-line no-console
        console.error(`[db] failed to create index on ${def.collection}`, error);
      });
  }
}
