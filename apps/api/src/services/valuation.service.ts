import type {
  CashBalance,
  DataStatus,
  Instrument,
  ValuedPosition,
} from "@jfolio/shared";
import { divide, isPositiveFinite, multiply, round, subtract } from "../domain/money";
import type { Repositories } from "../repositories/types";
import { prefetchHistoryLookups } from "./history-prefetch";
import { LookupCache } from "./lookup-cache";
import { MarketDataService } from "./market-data.service";
import { PositionService, ledgerCacheKey } from "./position.service";

export interface ValuationResult {
  portfolioId: string;
  baseCurrency: string;
  asOf: Date;
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

export interface ValuationOptions {
  baseCurrency?: string;
  asOf?: Date;
}

/**
 * Request-scoped inputs shared by every point of a history series. A single
 * valuation simply omits the context.
 */
export interface ValuationContext {
  cache?: LookupCache;
  /**
   * Instrument metadata preloaded for the whole ledger. Passing it avoids a
   * lookup per distinct holdings set inside a long history series.
   */
  instruments?: ReadonlyMap<string, Instrument>;
}

/** Staleness threshold for intraday data (NFR / UI-006). */
const STALE_MS = 24 * 60 * 60 * 1000;
/**
 * Number of history points valued concurrently. Bounded so a long series does
 * not exhaust the Mongo connection pool while still hiding per-point latency.
 */
const HISTORY_CONCURRENCY = 12;
/**
 * Safety bound for a generated series. Daily bars reach this only after ~54
 * years, while the normal "ALL" window is anchored to the first stored quote,
 * so this never truncates a realistic portfolio.
 */
const MAX_SERIES_POINTS = 20_000;

/**
 * FR-041 / FR-042 / FR-043 / FR-044 / FR-045 / FR-053: Computes market value,
 * base-currency conversion, unrealised P&L and returns for a portfolio, either
 * at the current time or at an arbitrary past instant.
 *
 * A position whose price or FX rate cannot be resolved is reported with
 * status UNAVAILABLE and is excluded from the totals — it is never rendered as
 * a zero value (UI-006).
 */
export class ValuationService {
  private readonly positions: PositionService;

  constructor(
    private readonly repos: Repositories,
    private readonly marketData: MarketDataService,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.positions = new PositionService(repos);
  }

  async valuate(
    portfolioId: string,
    options: ValuationOptions = {},
    context: ValuationContext = {},
  ): Promise<ValuationResult> {
    // Resolve the portfolio only when the caller does not already know the base
    // currency. A history series fixes it once for every point.
    const baseCurrency =
      options.baseCurrency ??
      (await this.repos.portfolios.findById(portfolioId))?.baseCurrency ??
      "KRW";
    const now = this.now();
    const asOf = options.asOf ?? now;
    // Per-holding change rates describe "today", so they are only resolved for
    // current valuations. Historical series only consume the totals.
    const isCurrent = this.marketData.isCurrent(asOf);

    const cache = context.cache;
    const { positions, warnings } = await this.positions.calculate(portfolioId, asOf, cache);
    const instrumentIds = positions.map((p) => p.instrumentId);
    let instrumentMap: ReadonlyMap<string, Instrument>;
    if (context.instruments) {
      instrumentMap = context.instruments;
    } else {
      const instruments = cache
        ? await cache.get(`instruments|${[...instrumentIds].sort().join(",")}`, () =>
            this.repos.instruments.findMany(instrumentIds),
          )
        : await this.repos.instruments.findMany(instrumentIds);
      instrumentMap = new Map<string, Instrument>(
        instruments.map((i) => [i.instrumentId, i]),
      );
    }

    const valued: ValuedPosition[] = [];
    const cashBalances: CashBalance[] = [];
    let totalAssetValue = 0;
    let totalCostBasis = 0;
    let unavailableCount = 0;
    let oldestPriceAt: number | null = null;

    for (const position of positions) {
      const instrument = instrumentMap.get(position.instrumentId);
      const base: ValuedPosition = {
        instrumentId: position.instrumentId,
        symbol: instrument?.symbol ?? position.instrumentId,
        name: instrument?.name ?? "Unknown instrument",
        assetType: instrument?.assetType ?? "UNKNOWN",
        currency: instrument?.currency ?? position.costCurrency,
        quantity: position.quantity,
        price: null,
        priceCurrency: instrument?.currency ?? position.costCurrency,
        priceTimestamp: null,
        fxRateToBase: null,
        marketValue: null,
        marketValueBase: null,
        costBasis: position.costBasis,
        costBasisBase: null,
        unrealizedPnL: null,
        unrealizedReturn: null,
        dailyChangeRate: null,
        status: "NORMAL",
      };

      if (!instrument) {
        valued.push({ ...base, status: "UNAVAILABLE", statusReason: "INSTRUMENT_NOT_FOUND" });
        unavailableCount += 1;
        continue;
      }

      // Determine the price and its currency.
      let price: number | null = null;
      let priceCurrency = instrument.currency;
      let priceTimestamp: Date | null = null;

      if (instrument.assetType === "CASH") {
        price = 1;
        priceTimestamp = asOf;
      } else {
        const quote = await this.marketData.getQuoteAsOf(instrument.instrumentId, asOf, cache);
        if (quote) {
          price = quote.price;
          priceCurrency = quote.currency || instrument.currency;
          priceTimestamp = quote.timestamp;
        }
      }

      if (price === null) {
        valued.push({ ...base, status: "UNAVAILABLE", statusReason: "NO_PRICE" });
        unavailableCount += 1;
        continue;
      }

      const dailyChangeRate =
        isCurrent && instrument.assetType !== "CASH" && priceTimestamp
          ? await this.resolveDailyChangeRate(
              instrument.instrumentId,
              price,
              priceTimestamp,
            )
          : null;

      const fxRateToBase = await this.marketData.getFxRate(
        priceCurrency,
        baseCurrency,
        asOf,
        cache,
      );
      if (fxRateToBase === null) {
        valued.push({
          ...base,
          price,
          priceTimestamp,
          dailyChangeRate,
          status: "UNAVAILABLE",
          statusReason: "NO_FX_RATE",
        });
        unavailableCount += 1;
        continue;
      }

      const costFx = await this.marketData.getFxRate(
        position.costCurrency,
        baseCurrency,
        asOf,
        cache,
      );
      const marketValue = multiply(position.quantity, price);
      const marketValueBase = multiply(marketValue, fxRateToBase);
      const costBasisBase = costFx === null ? null : multiply(position.costBasis, costFx);

      const unrealizedPnL =
        costBasisBase === null ? null : subtract(marketValueBase, costBasisBase);
      const ratio =
        costBasisBase === null || costBasisBase === 0 || unrealizedPnL === null
          ? null
          : divide(unrealizedPnL, costBasisBase);
      const unrealizedReturn = ratio === null ? null : multiply(ratio, 100);

      let status: DataStatus = "NORMAL";
      let statusReason: string | undefined;
      if (costBasisBase === null) {
        status = "UNAVAILABLE";
        statusReason = "NO_COST_FX_RATE";
        unavailableCount += 1;
      } else if (
        priceTimestamp &&
        instrument.assetType !== "CASH" &&
        asOf.getTime() - priceTimestamp.getTime() > STALE_MS &&
        asOf.getTime() >= Date.now() - 60_000
      ) {
        status = "STALE";
        statusReason = "STALE_PRICE";
      }

      if (priceTimestamp && instrument.assetType !== "CASH") {
        oldestPriceAt =
          oldestPriceAt === null ? priceTimestamp.getTime() : Math.min(oldestPriceAt, priceTimestamp.getTime());
      }

      valued.push({
        ...base,
        price,
        priceCurrency,
        priceTimestamp,
        fxRateToBase,
        marketValue,
        marketValueBase,
        costBasisBase,
        unrealizedPnL,
        unrealizedReturn,
        dailyChangeRate,
        status,
        statusReason,
      });

      if (instrument.assetType === "CASH") {
        cashBalances.push({
          currency: instrument.currency,
          amount: position.quantity,
          valueInBaseCurrency: marketValueBase,
          status,
        });
      }

      // Only fully-valued positions contribute to the totals.
      if (status !== "UNAVAILABLE") {
        totalAssetValue += marketValueBase;
        totalCostBasis += costBasisBase ?? 0;
      }
    }

    const unrealizedPnL = subtract(totalAssetValue, totalCostBasis);
    const unrealizedReturn =
      totalCostBasis === 0 ? null : multiply(divide(unrealizedPnL, totalCostBasis) as number, 100);

    let dataStatus: DataStatus = "NORMAL";
    if (unavailableCount > 0) dataStatus = "UNAVAILABLE";
    else if (oldestPriceAt !== null && asOf.getTime() - oldestPriceAt > STALE_MS) dataStatus = "STALE";
    else if (valued.length === 0) dataStatus = "NO_DATA";

    return {
      portfolioId,
      baseCurrency,
      asOf,
      dataStatus,
      totalAssetValue: round(totalAssetValue, 2),
      totalCostBasis: round(totalCostBasis, 2),
      unrealizedPnL: round(unrealizedPnL, 2),
      unrealizedReturn: unrealizedReturn === null ? null : round(unrealizedReturn, 4),
      positions: valued,
      cashBalances,
      unavailableCount,
      warnings,
    };
  }

  /** Latest quote-price change vs the previous daily close, in percent points. */
  private async resolveDailyChangeRate(
    instrumentId: string,
    price: number,
    priceTimestamp: Date,
  ): Promise<number | null> {
    const previousClose = await this.marketData.getPreviousDailyClose(
      instrumentId,
      priceTimestamp,
    );
    if (!previousClose || !isPositiveFinite(previousClose.price)) return null;
    const ratio = divide(subtract(price, previousClose.price), previousClose.price);
    return ratio === null ? null : round(multiply(ratio, 100), 4);
  }

  /**
   * FR-053: Start of the full ("ALL") history for a portfolio. The series
   * should begin at the first quote that actually exists for an instrument the
   * portfolio has ever held, not at an arbitrary one-year lookback. Cash-only
   * portfolios fall back to their first transaction.
   */
  async historyStart(portfolioId: string, options: { to?: Date } = {}): Promise<Date | null> {
    const to = options.to ?? this.now();
    const ledger = await this.repos.transactions.listByPortfolio(portfolioId, to);
    const firstTransaction = ledger[0]?.timestamp ?? null;
    if (ledger.length === 0) return firstTransaction;

    const instrumentIds = [...new Set(ledger.map((transaction) => transaction.instrumentId))];
    const instruments = await this.repos.instruments.findMany(instrumentIds);
    const pricedInstrumentIds = instruments
      .filter((instrument) => instrument.assetType !== "CASH")
      .map((instrument) => instrument.instrumentId);
    if (pricedInstrumentIds.length === 0) return firstTransaction;

    const earliest = await this.repos.quotes.getEarliest(pricedInstrumentIds);
    if (!earliest) return firstTransaction;
    // The chart is daily, so start at the beginning of the quote's UTC day.
    return new Date(
      Date.UTC(
        earliest.timestamp.getUTCFullYear(),
        earliest.timestamp.getUTCMonth(),
        earliest.timestamp.getUTCDate(),
      ),
    );
  }

  /** FR-053: Daily (or hourly) total-value series reconstructed from history. */
  async historySeries(
    portfolioId: string,
    options: { baseCurrency?: string; from: Date; to: Date; interval?: "hourly" | "daily" },
  ): Promise<Array<{ asOf: Date; totalAssetValue: number | null; dataStatus: DataStatus }>> {
    const interval = options.interval ?? "daily";
    const stepMs = interval === "hourly" ? 3_600_000 : 86_400_000;
    // The portfolio (and therefore its base currency) is fixed for the whole
    // series; resolving it once removes a lookup per point.
    const baseCurrency =
      options.baseCurrency ??
      (await this.repos.portfolios.findById(portfolioId))?.baseCurrency ??
      "KRW";
    const cache = new LookupCache();

    const cursors: Date[] = [];
    let cursor = new Date(options.from);
    while (cursor <= options.to && cursors.length < MAX_SERIES_POINTS) {
      cursors.push(cursor);
      cursor = new Date(cursor.getTime() + stepMs);
    }
    if (cursors.length === 0) return [];

    // Read the ledger and instrument metadata once for the whole series, then
    // bulk-load daily quotes and FX rates over the requested window. Every
    // point below is then valued from the request cache.
    const ledger = await cache.get(ledgerCacheKey(portfolioId), () =>
      this.repos.transactions.listByPortfolio(portfolioId),
    );
    const relevant = ledger.filter((transaction) => transaction.timestamp <= options.to);
    const ledgerInstrumentIds = [...new Set(relevant.map((t) => t.instrumentId))];
    const instruments =
      ledgerInstrumentIds.length > 0
        ? await this.repos.instruments.findMany(ledgerInstrumentIds)
        : [];
    const instrumentMap = new Map(
      instruments.map((instrument) => [instrument.instrumentId, instrument]),
    );

    const currencies = new Set<string>([baseCurrency]);
    for (const instrument of instruments) currencies.add(instrument.currency);
    for (const transaction of relevant) currencies.add(transaction.currency);

    await prefetchHistoryLookups({
      repos: this.repos,
      marketData: this.marketData,
      cache,
      instrumentIds: instruments
        .filter((instrument) => instrument.assetType !== "CASH")
        .map((instrument) => instrument.instrumentId),
      currencies,
      baseCurrency,
      from: options.from,
      to: options.to,
      cursors,
    });

    const context: ValuationContext = { cache, instruments: instrumentMap };
    const points: Array<{ asOf: Date; totalAssetValue: number | null; dataStatus: DataStatus }> = [];
    // Bound the number of points valued at once. The lookups themselves are
    // in-memory now; batching keeps intermediate valuation objects bounded for
    // long hourly series.
    for (let start = 0; start < cursors.length; start += HISTORY_CONCURRENCY) {
      const batch = cursors.slice(start, start + HISTORY_CONCURRENCY);
      const valuations = await Promise.all(
        batch.map(async (asOf) => {
          const valuation = await this.valuate(portfolioId, { baseCurrency, asOf }, context);
          return {
            asOf,
            totalAssetValue:
              valuation.dataStatus === "UNAVAILABLE" ? null : valuation.totalAssetValue,
            dataStatus: valuation.dataStatus,
          };
        }),
      );
      points.push(...valuations);
    }
    return points;
  }
}
