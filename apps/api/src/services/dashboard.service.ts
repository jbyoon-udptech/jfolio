import {
  ALL_PORTFOLIOS_ID,
  type DataStatus,
  type Portfolio,
  type SignalEvent,
  type ValuedPosition,
} from "@jfolio/shared";
import { add, divide, multiply, round, subtract } from "../domain/money";
import type { Repositories } from "../repositories/types";
import { ValuationService, type ValuationResult } from "./valuation.service";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AllocationSlice {
  key: string;
  marketValueBase: number;
  weight: number;
}

export interface PortfolioDashboardSummary {
  portfolioId: string;
  name: string;
  /** The portfolio's configured base currency, not the aggregate display currency. */
  nativeBaseCurrency: string;
  totalAssetValue: number | null;
  dailyChange: number | null;
  dailyChangeRate: number | null;
  totalCostBasis: number | null;
  unrealizedPnL: number | null;
  unrealizedReturn: number | null;
  /** Share of the aggregate valuation, in percentage points. */
  weight: number | null;
  dataStatus: DataStatus;
  unavailableCount: number;
}

export interface DashboardResult {
  portfolioId: string;
  baseCurrency: string;
  asOf: Date;
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
  lastDataUpdatedAt: Date | null;
  /** Per-portfolio breakdown; present for the aggregate `all` dashboard. */
  portfolios?: PortfolioDashboardSummary[];
}

export interface DashboardHistoryPoint {
  asOf: Date;
  totalAssetValue: number | null;
  dataStatus: DataStatus;
}

export interface DashboardHistorySeries {
  portfolioId: string;
  name: string;
  items: DashboardHistoryPoint[];
}

export interface DashboardHistoryResult {
  /** Aggregate series. A point is null when any portfolio is unavailable. */
  items: DashboardHistoryPoint[];
  series: DashboardHistorySeries[];
}

/**
 * UI-001 / FR-014: Aggregated dashboard view. Uses only stored data — it never
 * calls external providers (NFR-001).
 */
export class DashboardService {
  constructor(
    private readonly repos: Repositories,
    private readonly valuation: ValuationService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getDashboard(
    portfolioId: string,
    options: { baseCurrency?: string } = {},
  ): Promise<DashboardResult> {
    const now = this.now();
    const current = await this.valuation.valuate(portfolioId, {
      baseCurrency: options.baseCurrency,
      asOf: now,
    });
    const previous = await this.valuation.valuate(portfolioId, {
      baseCurrency: options.baseCurrency,
      asOf: new Date(now.getTime() - DAY_MS),
    });
    return this.toDashboard(portfolioId, current, previous);
  }

  /**
   * UI-001: value every visible portfolio in one common base currency. Hidden
   * portfolios are resolved by the route and therefore never contribute here.
   */
  async getDashboardForAll(
    portfolios: Portfolio[],
    options: { baseCurrency: string },
  ): Promise<DashboardResult> {
    const now = this.now();
    const current = await this.aggregateValuations(
      portfolios.map((portfolio) => portfolio.portfolioId),
      {
        baseCurrency: options.baseCurrency,
        asOf: now,
      },
    );
    const previous = await this.aggregateValuations(
      portfolios.map((portfolio) => portfolio.portfolioId),
      {
        baseCurrency: options.baseCurrency,
        asOf: new Date(now.getTime() - DAY_MS),
      },
    );
    const dashboard = await this.toDashboard(
      ALL_PORTFOLIOS_ID,
      current.aggregate,
      previous.aggregate,
    );

    return {
      ...dashboard,
      portfolios: portfolios.flatMap((portfolio, index) => {
        const result = current.results[index];
        const previousResult = previous.results[index];
        if (!result || !previousResult) return [];
        return [
          buildPortfolioSummary(
            portfolio,
            result,
            previousResult,
            current.aggregate.totalAssetValue,
          ),
        ];
      }),
    };
  }

  /**
   * FR-053: earliest start for the aggregate `ALL` chart. The aggregate must
   * not begin later than the longest history it contains, otherwise a
   * portfolio with older quotes would be clipped to another portfolio's first
   * observation.
   */
  async historyStartForAll(
    portfolios: Portfolio[],
    options: { to?: Date } = {},
  ): Promise<Date | null> {
    const starts = await Promise.all(
      portfolios.map((portfolio) =>
        this.valuation.historyStart(portfolio.portfolioId, options),
      ),
    );
    let earliest: Date | null = null;
    for (const start of starts) {
      if (start && (!earliest || start.getTime() < earliest.getTime())) {
        earliest = start;
      }
    }
    return earliest;
  }

  /**
   * FR-053: aggregate history for the `All` dashboard. A point is unavailable
   * when any portfolio is unavailable at that time, so the total is never
   * understated by a partial series. The per-portfolio series are returned
   * alongside the aggregate so the UI can draw one line per portfolio.
   */
  async getHistoryForAll(
    portfolios: Portfolio[],
    options: {
      baseCurrency: string;
      from: Date;
      to: Date;
      interval?: "hourly" | "daily";
    },
  ): Promise<DashboardHistoryResult> {
    if (portfolios.length === 0) return { items: [], series: [] };
    const series = await Promise.all(
      portfolios.map((portfolio) =>
        this.valuation.historySeries(portfolio.portfolioId, options),
      ),
    );
    const first = series[0];
    if (!first) return { items: [], series: [] };

    const items = first.map((point, index) => {
      const points = series.map((items) => items[index]);
      const values = points.map((item) => item?.totalAssetValue);
      const complete = values.every(
        (value): value is number => value !== null && value !== undefined,
      );
      return {
        asOf: point.asOf,
        totalAssetValue: complete ? round(add(...values), 2) : null,
        dataStatus: mergeDataStatus(
          points.map((item) => item?.dataStatus ?? "NO_DATA"),
        ),
      };
    });

    return {
      items,
      series: portfolios.map((portfolio, index) => ({
        portfolioId: portfolio.portfolioId,
        name: portfolio.name,
        items: series[index] ?? [],
      })),
    };
  }

  private async aggregateValuations(
    portfolioIds: string[],
    options: { baseCurrency: string; asOf: Date },
  ): Promise<{ aggregate: ValuationResult; results: ValuationResult[] }> {
    if (portfolioIds.length === 0) {
      return {
        aggregate: {
          portfolioId: ALL_PORTFOLIOS_ID,
          baseCurrency: options.baseCurrency,
          asOf: options.asOf,
          dataStatus: "NO_DATA",
          totalAssetValue: 0,
          totalCostBasis: 0,
          unrealizedPnL: 0,
          unrealizedReturn: null,
          positions: [],
          cashBalances: [],
          unavailableCount: 0,
          warnings: [],
        },
        results: [],
      };
    }

    const results = await Promise.all(
      portfolioIds.map((portfolioId) =>
        this.valuation.valuate(portfolioId, {
          baseCurrency: options.baseCurrency,
          asOf: options.asOf,
        }),
      ),
    );

    const totalAssetValue = round(
      add(...results.map((result) => result.totalAssetValue ?? 0)),
      2,
    );
    const totalCostBasis = round(
      add(...results.map((result) => result.totalCostBasis ?? 0)),
      2,
    );
    const unrealizedPnL = round(subtract(totalAssetValue, totalCostBasis), 2);
    const unrealizedReturn =
      totalCostBasis === 0
        ? null
        : round(
            multiply(divide(unrealizedPnL, totalCostBasis) as number, 100),
            4,
          );

    return {
      aggregate: {
        portfolioId: ALL_PORTFOLIOS_ID,
        baseCurrency: results[0]?.baseCurrency ?? options.baseCurrency,
        asOf: options.asOf,
        dataStatus: mergeDataStatus(results.map((result) => result.dataStatus)),
        totalAssetValue,
        totalCostBasis,
        unrealizedPnL,
        unrealizedReturn,
        positions: results.flatMap((result) => result.positions),
        cashBalances: results.flatMap((result) => result.cashBalances),
        unavailableCount: results.reduce(
          (total, result) => total + result.unavailableCount,
          0,
        ),
        warnings: results.flatMap((result) => result.warnings),
      },
      results,
    };
  }

  private async toDashboard(
    portfolioId: string,
    current: ValuationResult,
    previous: ValuationResult,
  ): Promise<DashboardResult> {
    const allocationByAssetType = buildAllocation(current.positions, (p) => p.assetType);
    const allocationByCurrency = buildAllocation(current.positions, (p) => p.currency);

    // `topHoldings` is kept as the API field name for compatibility, but the
    // dashboard now shows every non-cash holding rather than only the top ten.
    const topHoldings = mergeAvailablePositions(current.positions)
      .filter((p) => p.assetType !== "CASH")
      .sort((a, b) => (b.marketValueBase ?? 0) - (a.marketValueBase ?? 0));

    const events = await this.repos.signalEvents.list({ limit: 5 });
    const lastDataUpdatedAt = current.positions.reduce<Date | null>((latest, p) => {
      if (!p.priceTimestamp) return latest;
      if (!latest || p.priceTimestamp > latest) return p.priceTimestamp;
      return latest;
    }, null);

    // UI-006 / FR-053: never derive a change from an unavailable baseline. When
    // either endpoint could not be fully valued the change is unknown, not zero.
    const dailyChange =
      current.dataStatus === "UNAVAILABLE" ||
      previous.dataStatus === "UNAVAILABLE" ||
      current.totalAssetValue === null ||
      previous.totalAssetValue === null
        ? null
        : subtract(current.totalAssetValue, previous.totalAssetValue);
    const dailyChangeRate =
      dailyChange === null ||
      previous.totalAssetValue === null ||
      previous.totalAssetValue === 0
        ? null
        : multiply(divide(dailyChange, previous.totalAssetValue) as number, 100);

    return {
      portfolioId,
      baseCurrency: current.baseCurrency,
      asOf: current.asOf,
      totalAssetValue: current.totalAssetValue,
      dailyChange,
      dailyChangeRate,
      totalCostBasis: current.totalCostBasis,
      unrealizedPnL: current.unrealizedPnL,
      unrealizedReturn: current.unrealizedReturn,
      dataStatus: current.dataStatus,
      unavailableCount: current.unavailableCount,
      allocationByAssetType,
      allocationByCurrency,
      topHoldings,
      recentSignals: events.items,
      lastDataUpdatedAt,
    };
  }
}

function buildPortfolioSummary(
  portfolio: Portfolio,
  current: ValuationResult,
  previous: ValuationResult,
  aggregateTotal: number | null,
): PortfolioDashboardSummary {
  // Match the aggregate dashboard rule: never derive a change from an
  // unavailable baseline. The change is unknown, not zero.
  const dailyChange =
    current.dataStatus === "UNAVAILABLE" ||
    previous.dataStatus === "UNAVAILABLE" ||
    current.totalAssetValue === null ||
    previous.totalAssetValue === null
      ? null
      : subtract(current.totalAssetValue, previous.totalAssetValue);
  const dailyChangeRate =
    dailyChange === null ||
    previous.totalAssetValue === null ||
    previous.totalAssetValue === 0
      ? null
      : multiply(divide(dailyChange, previous.totalAssetValue) as number, 100);
  const weight =
    aggregateTotal === null ||
    aggregateTotal === 0 ||
    current.totalAssetValue === null
      ? null
      : round(
          multiply(divide(current.totalAssetValue, aggregateTotal) as number, 100),
          4,
        );

  return {
    portfolioId: portfolio.portfolioId,
    name: portfolio.name,
    nativeBaseCurrency: portfolio.baseCurrency,
    totalAssetValue: current.totalAssetValue,
    dailyChange,
    dailyChangeRate,
    totalCostBasis: current.totalCostBasis,
    unrealizedPnL: current.unrealizedPnL,
    unrealizedReturn: current.unrealizedReturn,
    weight,
    dataStatus: current.dataStatus,
    unavailableCount: current.unavailableCount,
  };
}

function mergeDataStatus(statuses: DataStatus[]): DataStatus {
  if (statuses.length === 0) return "NO_DATA";
  if (statuses.includes("UNAVAILABLE")) return "UNAVAILABLE";
  if (statuses.includes("ERROR")) return "ERROR";
  if (statuses.includes("STALE")) return "STALE";
  if (statuses.includes("DELAYED")) return "DELAYED";
  if (statuses.every((status) => status === "NO_DATA")) return "NO_DATA";
  return "NORMAL";
}

/**
 * Combine the same instrument held in multiple portfolios so `topHoldings` is a
 * true cross-portfolio ranking rather than duplicated rows.
 */
function mergeAvailablePositions(positions: ValuedPosition[]): ValuedPosition[] {
  const merged = new Map<string, ValuedPosition>();
  for (const position of positions) {
    if (position.marketValueBase === null) continue;
    const existing = merged.get(position.instrumentId);
    if (!existing) {
      merged.set(position.instrumentId, { ...position });
      continue;
    }

    const costBasisBase = sumNullable(existing.costBasisBase, position.costBasisBase);
    const unrealizedPnL = sumNullable(existing.unrealizedPnL, position.unrealizedPnL);
    merged.set(position.instrumentId, {
      ...existing,
      quantity: add(existing.quantity, position.quantity),
      price: existing.price ?? position.price,
      priceTimestamp: latestDate(existing.priceTimestamp, position.priceTimestamp),
      fxRateToBase: existing.fxRateToBase ?? position.fxRateToBase,
      marketValue: sumNullable(existing.marketValue, position.marketValue),
      marketValueBase: sumNullable(existing.marketValueBase, position.marketValueBase),
      costBasis: sumNullable(existing.costBasis, position.costBasis),
      costBasisBase,
      unrealizedPnL,
      unrealizedReturn:
        costBasisBase === null || costBasisBase === 0 || unrealizedPnL === null
          ? null
          : round(multiply(divide(unrealizedPnL, costBasisBase) as number, 100), 4),
      // The same instrument has the same quote in every portfolio; never sum it.
      dailyChangeRate: existing.dailyChangeRate ?? position.dailyChangeRate,
      status: mergeDataStatus([existing.status, position.status]),
      statusReason: existing.statusReason ?? position.statusReason,
    });
  }
  return [...merged.values()];
}

function sumNullable(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : add(a, b);
}

function latestDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function buildAllocation(
  positions: ValuedPosition[],
  keyOf: (p: ValuedPosition) => string,
): AllocationSlice[] {
  const totals = new Map<string, number>();
  let grandTotal = 0;
  for (const position of positions) {
    if (position.marketValueBase === null || position.status === "UNAVAILABLE") continue;
    const key = keyOf(position);
    totals.set(key, (totals.get(key) ?? 0) + position.marketValueBase);
    grandTotal += position.marketValueBase;
  }
  return [...totals.entries()]
    .map(([key, marketValueBase]) => ({
      key,
      marketValueBase,
      weight: grandTotal === 0 ? 0 : multiply(divide(marketValueBase, grandTotal) as number, 100),
    }))
    .sort((a, b) => b.marketValueBase - a.marketValueBase);
}
