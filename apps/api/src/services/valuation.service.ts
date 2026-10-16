import type {
  CashBalance,
  DataStatus,
  Instrument,
  ValuedPosition,
} from "@jfolio/shared";
import { divide, multiply, round, subtract } from "../domain/money";
import type { Repositories } from "../repositories/types";
import { MarketDataService } from "./market-data.service";
import { PositionService } from "./position.service";

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

/** Staleness threshold for intraday data (NFR / UI-006). */
const STALE_MS = 24 * 60 * 60 * 1000;

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
  ) {
    this.positions = new PositionService(repos);
  }

  async valuate(portfolioId: string, options: ValuationOptions = {}): Promise<ValuationResult> {
    const portfolio = await this.repos.portfolios.findById(portfolioId);
    const baseCurrency = options.baseCurrency ?? portfolio?.baseCurrency ?? "KRW";
    const asOf = options.asOf ?? new Date();

    const { positions, warnings } = await this.positions.calculate(portfolioId, asOf);
    const instruments = await this.repos.instruments.findMany(
      positions.map((p) => p.instrumentId),
    );
    const instrumentMap = new Map<string, Instrument>(
      instruments.map((i) => [i.instrumentId, i]),
    );

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
        const quote = await this.marketData.getQuoteAsOf(instrument.instrumentId, asOf);
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

      const fxRateToBase = await this.marketData.getFxRate(priceCurrency, baseCurrency, asOf);
      if (fxRateToBase === null) {
        valued.push({
          ...base,
          price,
          priceTimestamp,
          status: "UNAVAILABLE",
          statusReason: "NO_FX_RATE",
        });
        unavailableCount += 1;
        continue;
      }

      const costFx = await this.marketData.getFxRate(position.costCurrency, baseCurrency, asOf);
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

  /** FR-053: Daily (or hourly) total-value series reconstructed from history. */
  async historySeries(
    portfolioId: string,
    options: { baseCurrency?: string; from: Date; to: Date; interval?: "hourly" | "daily" },
  ): Promise<Array<{ asOf: Date; totalAssetValue: number | null; dataStatus: DataStatus }>> {
    const interval = options.interval ?? "daily";
    const stepMs = interval === "hourly" ? 3_600_000 : 86_400_000;
    const points: Array<{ asOf: Date; totalAssetValue: number | null; dataStatus: DataStatus }> = [];
    let cursor = new Date(options.from);
    let guard = 0;
    while (cursor <= options.to && guard < 2000) {
      const valuation = await this.valuate(portfolioId, {
        baseCurrency: options.baseCurrency,
        asOf: cursor,
      });
      points.push({
        asOf: cursor,
        totalAssetValue:
          valuation.dataStatus === "UNAVAILABLE" ? null : valuation.totalAssetValue,
        dataStatus: valuation.dataStatus,
      });
      cursor = new Date(cursor.getTime() + stepMs);
      guard += 1;
    }
    return points;
  }
}
