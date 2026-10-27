import type { LatestQuote, MarketQuote } from "@jfolio/shared";
import { isPositiveFinite } from "../domain/money";
import type { Repositories } from "../repositories/types";
import type { FxRateSource } from "./fx-resolver";
import { resolveFxRate } from "./fx-resolver";
import type { LookupCache } from "./lookup-cache";
import {
  fxRateKey,
  quoteAsOfKey,
  type MarketDataService,
} from "./market-data.service";

/**
 * Safety bounds for the bulk range queries. Daily bars are ~365/year and FX
 * rates are normally one row per day, so these caps are far above a one-year
 * request while still protecting against unbounded scans.
 */
const DAILY_QUOTE_LIMIT = 10_000;
const FX_RATE_LIMIT = 10_000;
/** Bound concurrent bulk range queries (per prefetch pass). */
const PREFETCH_CONCURRENCY = 12;

interface DailyPoint {
  timestamp: number;
  quote: MarketQuote;
}

interface DailySeries {
  /** Ascending by timestamp, including one quote at or before `from`. */
  points: DailyPoint[];
  /**
   * Earliest instant for which the series is complete. If the range query was
   * truncated, earlier points must fall back to the repository instead of
   * trusting the seed.
   */
  coveredFrom: number;
}

interface RatePoint {
  timestamp: number;
  rate: number;
}

interface RateSeries {
  points: RatePoint[];
  coveredFrom: number;
}

export interface HistoryPrefetchOptions {
  repos: Repositories;
  marketData: MarketDataService;
  cache: LookupCache;
  /** Non-cash instruments whose quotes the series will need. */
  instrumentIds: string[];
  /** Every currency that can appear as a price or cost currency. */
  currencies: Iterable<string>;
  baseCurrency: string;
  from: Date;
  to: Date;
  cursors: Date[];
}

/**
 * Phase 2 history fast path: read the whole requested window once per
 * instrument / FX pair, then seed the request cache so each point is valued
 * from memory.
 *
 * Semantics are preserved deliberately:
 * - daily closes still win over intraday quotes;
 * - now-ish points still prefer the materialised latest quote;
 * - points with no daily quote are left unseeded so `getQuoteAsOf` can fall
 *   back to any interval (the bulk daily read cannot represent that safely);
 * - a truncated range only seeds points the read actually covers.
 */
export async function prefetchHistoryLookups(
  options: HistoryPrefetchOptions,
): Promise<void> {
  await Promise.all([prefetchQuotes(options), prefetchFxRates(options)]);
}

/** Index of the last entry with `timestamp <= time`, or -1. */
function lastIndexAtOrBefore(
  points: ReadonlyArray<{ timestamp: number }>,
  time: number,
): number {
  let low = 0;
  let high = points.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (points[mid]!.timestamp <= time) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

/**
 * Bound concurrent range reads. A ledger with many instruments would otherwise
 * open one query per instrument and pair at once and exhaust the Mongo pool.
 */
async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  load: (item: T) => Promise<void>,
): Promise<void> {
  for (let start = 0; start < items.length; start += limit) {
    await Promise.all(items.slice(start, start + limit).map(load));
  }
}

async function prefetchQuotes(options: HistoryPrefetchOptions): Promise<void> {
  const { repos, marketData, cache, from, to, cursors } = options;
  const instrumentIds = [...new Set(options.instrumentIds)];
  if (instrumentIds.length === 0 || cursors.length === 0) return;

  // The materialised latest quote is only relevant for now-ish points.
  const latest = cursors.some((asOf) => marketData.isCurrent(asOf))
    ? await repos.quotes.getLatestMany(instrumentIds)
    : new Map<string, LatestQuote>();

  const dailyByInstrument = new Map<string, DailySeries>();
  await mapWithConcurrency(
    instrumentIds,
    PREFETCH_CONCURRENCY,
    async (instrumentId) => {
      const [seed, range] = await Promise.all([
        // Strictly-before is exclusive, so +1ms makes a quote exactly at
        // `from` part of the seed.
        repos.quotes.getLastBefore(
          instrumentId,
          new Date(from.getTime() + 1),
          "1d",
        ),
        repos.quotes.getHistorical(instrumentId, {
          from,
          to,
          interval: "1d",
          limit: DAILY_QUOTE_LIMIT,
        }),
      ]);
      // `getHistorical` is newest-first; the oldest returned row is the start
      // of the covered window when the limit was hit.
      const truncated = range.length >= DAILY_QUOTE_LIMIT;
      const coveredFrom =
        truncated && range.length > 0
          ? range[range.length - 1]!.timestamp.getTime()
          : Number.NEGATIVE_INFINITY;
      const points: DailyPoint[] = [...(seed ? [seed] : []), ...range]
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
        .map((quote) => ({ timestamp: quote.timestamp.getTime(), quote }));
      dailyByInstrument.set(instrumentId, { points, coveredFrom });
    },
  );

  for (const instrumentId of instrumentIds) {
    const series = dailyByInstrument.get(instrumentId);
    if (!series) continue;
    for (const asOf of cursors) {
      if (marketData.isCurrent(asOf)) {
        const current = latest.get(instrumentId);
        if (current) {
          cache.seed(quoteAsOfKey(instrumentId, asOf), current);
          continue;
        }
      }
      if (asOf.getTime() < series.coveredFrom) continue;
      const index = lastIndexAtOrBefore(series.points, asOf.getTime());
      // No daily close: leave the key empty so getQuoteAsOf can try any
      // interval against the repository.
      if (index < 0) continue;
      cache.seed(quoteAsOfKey(instrumentId, asOf), series.points[index]!.quote);
    }
  }
}

function pairKey(base: string, quote: string): string {
  return `${base}|${quote}`;
}

/** In-memory source over a pre-fetched rate series. */
class PreloadedFxRateSource implements FxRateSource {
  constructor(private readonly series: ReadonlyMap<string, RateSeries>) {}

  async rate(base: string, quote: string, asOf: Date): Promise<number | null> {
    const found = this.series.get(pairKey(base, quote));
    if (!found) return null;
    const index = lastIndexAtOrBefore(found.points, asOf.getTime());
    if (index < 0) return null;
    const point = found.points[index]!;
    return isPositiveFinite(point.rate) ? point.rate : null;
  }
}

/** Pairs that `resolveFxRate` may read for one conversion. */
function neededFxPairs(
  from: string,
  to: string,
  stablecoinPegs: ReadonlySet<string>,
): Set<string> {
  const pairs = new Set<string>([pairKey(from, to), pairKey(to, from)]);
  const fromPegged = stablecoinPegs.has(from);
  const toPegged = stablecoinPegs.has(to);
  if (fromPegged && !toPegged) {
    // from -> USD -> to. Resolving to USD itself needs no fiat pair.
    if (to !== "USD") {
      pairs.add(pairKey("USD", to));
      pairs.add(pairKey(to, "USD"));
    }
  } else if (toPegged && !fromPegged) {
    // from -> USD -> to. Resolving from USD itself needs no fiat pair.
    if (from !== "USD") {
      pairs.add(pairKey(from, "USD"));
      pairs.add(pairKey("USD", from));
    }
  }
  return pairs;
}

async function prefetchFxRates(options: HistoryPrefetchOptions): Promise<void> {
  const { repos, marketData, cache, baseCurrency, from, to, cursors } = options;
  if (cursors.length === 0) return;

  const currencies = new Set(options.currencies);
  currencies.add(baseCurrency);
  const pegs = marketData.stablecoinPegs;
  // USD is only needed as an anchor when a stablecoin participates: the peg
  // bridge converts through USD, and a pure-KRW portfolio should not query it.
  const needsUsd = [...currencies].some((currency) => pegs.has(currency));
  const anchors = new Set<string>([baseCurrency]);
  if (needsUsd) anchors.add("USD");

  const pairs = new Set<string>();
  for (const currency of currencies) {
    for (const anchor of anchors) {
      if (currency === anchor) continue;
      pairs.add(pairKey(currency, anchor));
      pairs.add(pairKey(anchor, currency));
    }
  }
  if (pairs.size === 0) return;

  const series = new Map<string, RateSeries>();
  await mapWithConcurrency([...pairs], PREFETCH_CONCURRENCY, async (key) => {
    const [base, quote] = key.split("|") as [string, string];
    const [seed, range] = await Promise.all([
      repos.fxRates.getRate(base, quote, from),
      repos.fxRates.getRates(base, quote, {
        from,
        to,
        limit: FX_RATE_LIMIT,
      }),
    ]);
    const truncated = range.length >= FX_RATE_LIMIT;
    const coveredFrom =
      truncated && range.length > 0
        ? range[range.length - 1]!.timestamp.getTime()
        : from.getTime();
    const points: RatePoint[] = [];
    if (seed) {
      points.push({ timestamp: seed.timestamp.getTime(), rate: seed.rate });
    }
    for (const rate of range) {
      points.push({ timestamp: rate.timestamp.getTime(), rate: rate.rate });
    }
    points.sort((a, b) => a.timestamp - b.timestamp);
    // The seed and the range's inclusive lower bound can be the same row.
    const deduped: RatePoint[] = [];
    for (const point of points) {
      const last = deduped[deduped.length - 1];
      if (last && last.timestamp === point.timestamp) {
        deduped[deduped.length - 1] = point;
      } else {
        deduped.push(point);
      }
    }
    series.set(key, { points: deduped, coveredFrom });
  });

  const source = new PreloadedFxRateSource(series);
  for (const currency of currencies) {
    if (currency === baseCurrency) continue;
    const needed = neededFxPairs(currency, baseCurrency, pegs);
    let coveredFrom = Number.NEGATIVE_INFINITY;
    let complete = true;
    for (const key of needed) {
      const found = series.get(key);
      if (!found) {
        complete = false;
        break;
      }
      coveredFrom = Math.max(coveredFrom, found.coveredFrom);
    }
    if (!complete) continue;
    for (const asOf of cursors) {
      if (asOf.getTime() < coveredFrom) continue;
      cache.seed(
        fxRateKey(currency, baseCurrency, asOf),
        await resolveFxRate(source, currency, baseCurrency, asOf, pegs),
      );
    }
  }
}
