import type { AssetType, DataInterval, QuoteInterval } from "@jfolio/shared";

/**
 * Asset types that share one scheduler tick, keyed by the configured interval
 * section. ETFs use the stock provider and therefore refresh on the stock
 * cadence; CASH and asset types without a provider have no scheduled tick.
 */
export const COLLECTION_SCHEDULES = {
  STOCK: ["STOCK", "ETF"],
  CRYPTO: ["CRYPTO"],
  FX: ["FX"],
} as const satisfies Record<string, readonly AssetType[]>;

export type CollectionSchedule = keyof typeof COLLECTION_SCHEDULES;

const SCHEDULE_BY_ASSET_TYPE = new Map<AssetType, CollectionSchedule>(
  (Object.entries(COLLECTION_SCHEDULES) as Array<
    [CollectionSchedule, readonly AssetType[]]
  >).flatMap(([schedule, assetTypes]) =>
    assetTypes.map((assetType) => [assetType, schedule] as const),
  ),
);

/** Scheduler section that governs an asset type, or null when it has no tick. */
export function collectionScheduleFor(assetType: AssetType): CollectionSchedule | null {
  return SCHEDULE_BY_ASSET_TYPE.get(assetType) ?? null;
}

/** Canonical duration of each supported interval. `tick` uses 1s as a floor. */
export const INTERVAL_MS: Record<DataInterval, number> = {
  tick: 1000,
  "10s": 10_000,
  "1m": 60_000,
  "5m": 300_000,
  "1h": 3_600_000,
  "1d": 86_400_000,
};

/**
 * Convert a configured collection period in seconds into the interval label
 * stored with each quote. Known intervals keep their canonical short form
 * (600 -> "10m"), while custom cadences use an explicit unit (90 -> "90s").
 */
export function quoteIntervalFromSeconds(seconds: number): QuoteInterval {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new RangeError(`collection interval seconds must be positive, got ${seconds}`);
  }
  const exact = (Object.entries(INTERVAL_MS) as Array<[DataInterval, number]>).find(
    ([, ms]) => ms === seconds * 1000,
  );
  if (exact) return exact[0];
  if (seconds % 86_400 === 0) return `${seconds / 86_400}d`;
  if (seconds % 3_600 === 0) return `${seconds / 3_600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

export function intervalToMs(interval: DataInterval): number {
  return INTERVAL_MS[interval] ?? INTERVAL_MS["1m"];
}

/** Round a timestamp down to the start of its interval bucket (UTC). */
export function floorToInterval(date: Date, interval: DataInterval): Date {
  const ms = intervalToMs(interval);
  return new Date(Math.floor(date.getTime() / ms) * ms);
}

/** Deterministic 32-bit hash for reproducible synthetic data. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
