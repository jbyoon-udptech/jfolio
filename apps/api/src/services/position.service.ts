import type { Position, RealizedPnl } from "@jfolio/shared";
import { calculatePositions, type PositionCalculation } from "../domain/position-calculator";
import type { Repositories } from "../repositories/types";

/**
 * FR-031: Derives current / historical holdings from the transaction ledger.
 * Nothing here is persisted — the ledger is the source of truth.
 */
export class PositionService {
  constructor(private readonly repos: Repositories) {}

  async calculate(portfolioId: string, asOf?: Date): Promise<PositionCalculation> {
    const transactions = await this.repos.transactions.listByPortfolio(portfolioId, asOf);
    return calculatePositions(portfolioId, transactions, { asOf });
  }

  async getPositions(portfolioId: string, asOf?: Date): Promise<Position[]> {
    return (await this.calculate(portfolioId, asOf)).positions;
  }

  async getRealized(portfolioId: string, asOf?: Date): Promise<RealizedPnl[]> {
    return (await this.calculate(portfolioId, asOf)).realized;
  }
}
