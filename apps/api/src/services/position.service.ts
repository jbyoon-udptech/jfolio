import type { Position, RealizedPnl } from "@jfolio/shared";
import { calculatePositions, type PositionCalculation } from "../domain/position-calculator";
import type { Repositories } from "../repositories/types";
import type { LookupCache } from "./lookup-cache";

/** Cache key for the full portfolio ledger (shared with history prefetch). */
export function ledgerCacheKey(portfolioId: string): string {
  return `ledger|${portfolioId}`;
}

/**
 * FR-031: Derives current / historical holdings from the transaction ledger.
 * Nothing here is persisted — the ledger is the source of truth.
 */
export class PositionService {
  constructor(private readonly repos: Repositories) {}

  /**
   * `cache` loads the full ledger once and lets `calculatePositions` apply the
   * as-of cutoff in memory. Without it (a single valuation) the query is bounded
   * by `asOf` as before.
   */
  async calculate(
    portfolioId: string,
    asOf?: Date,
    cache?: LookupCache,
  ): Promise<PositionCalculation> {
    const transactions = cache
      ? await cache.get(ledgerCacheKey(portfolioId), () =>
          this.repos.transactions.listByPortfolio(portfolioId),
        )
      : await this.repos.transactions.listByPortfolio(portfolioId, asOf);
    return calculatePositions(portfolioId, transactions, { asOf });
  }

  async getPositions(portfolioId: string, asOf?: Date): Promise<Position[]> {
    return (await this.calculate(portfolioId, asOf)).positions;
  }

  async getRealized(portfolioId: string, asOf?: Date): Promise<RealizedPnl[]> {
    return (await this.calculate(portfolioId, asOf)).realized;
  }
}
