import type { PortfolioSnapshot, SnapshotType } from "@jfolio/shared";
import { newId } from "../domain/ids";
import type { Repositories, SnapshotFilter } from "../repositories/types";
import { ValuationService } from "./valuation.service";

export interface CreateSnapshotInput {
  portfolioId: string;
  snapshotType: SnapshotType;
  asOf?: Date;
  baseCurrency?: string;
}

/**
 * FR-050 / FR-052: Persist an idempotent valuation snapshot. Re-running for the
 * same portfolio + type + asOf updates the existing snapshot rather than
 * creating a duplicate.
 */
export class SnapshotService {
  constructor(
    private readonly repos: Repositories,
    private readonly valuation: ValuationService,
  ) {}

  async createSnapshot(input: CreateSnapshotInput): Promise<PortfolioSnapshot> {
    const asOf = input.asOf ?? new Date();
    const valuation = await this.valuation.valuate(input.portfolioId, {
      baseCurrency: input.baseCurrency,
      asOf,
    });

    const snapshot: PortfolioSnapshot = {
      snapshotId: newId("snap"),
      portfolioId: input.portfolioId,
      snapshotType: input.snapshotType,
      asOf,
      capturedAt: new Date(),
      baseCurrency: valuation.baseCurrency,
      totalAssetValue: valuation.totalAssetValue,
      totalCostBasis: valuation.totalCostBasis,
      unrealizedPnL: valuation.unrealizedPnL,
      dataStatus: valuation.dataStatus,
      positions: valuation.positions.map((p) => ({
        instrumentId: p.instrumentId,
        quantity: p.quantity,
        price: p.price,
        priceCurrency: p.priceCurrency,
        priceTimestamp: p.priceTimestamp,
        fxRateToBase: p.fxRateToBase,
        marketValue: p.marketValue,
        marketValueBase: p.marketValueBase,
        costBasis: p.costBasis,
        unrealizedPnL: p.unrealizedPnL,
        status: p.status,
      })),
      cashBalances: valuation.cashBalances.map((c) => ({
        currency: c.currency,
        amount: c.amount,
        valueInBaseCurrency: c.valueInBaseCurrency,
      })),
    };

    return this.repos.snapshots.upsert(snapshot);
  }

  async list(portfolioId: string, filter?: SnapshotFilter): Promise<PortfolioSnapshot[]> {
    return this.repos.snapshots.list(portfolioId, filter);
  }

  async get(snapshotId: string): Promise<PortfolioSnapshot | null> {
    return this.repos.snapshots.findById(snapshotId);
  }
}
