import type { DataStatus, SignalEvent, ValuedPosition } from "@jfolio/shared";
import { divide, multiply, subtract } from "../domain/money";
import type { Repositories } from "../repositories/types";
import { ValuationService } from "./valuation.service";

export interface AllocationSlice {
  key: string;
  marketValueBase: number;
  weight: number;
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
      asOf: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    });

    const allocationByAssetType = buildAllocation(current.positions, (p) => p.assetType);
    const allocationByCurrency = buildAllocation(current.positions, (p) => p.currency);

    const topHoldings = [...current.positions]
      .filter((p) => p.marketValueBase !== null && p.assetType !== "CASH")
      .sort((a, b) => (b.marketValueBase ?? 0) - (a.marketValueBase ?? 0))
      .slice(0, 10);

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
