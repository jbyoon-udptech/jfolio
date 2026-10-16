import type { Portfolio } from "@jfolio/shared";
import { newId } from "../domain/ids";
import type { Repositories } from "../repositories/types";

export interface CreatePortfolioInput {
  name: string;
  baseCurrency?: string;
  isDefault?: boolean;
  userId?: string;
}

export const DEFAULT_USER_ID = "default-user";

export class PortfolioService {
  constructor(private readonly repos: Repositories) {}

  async create(input: CreatePortfolioInput): Promise<Portfolio> {
    const now = new Date();
    const userId = input.userId ?? DEFAULT_USER_ID;
    const isFirst = (await this.repos.portfolios.list(userId)).length === 0;
    const portfolio: Portfolio = {
      portfolioId: newId("pf"),
      userId,
      name: input.name,
      baseCurrency: input.baseCurrency ?? "KRW",
      isDefault: input.isDefault ?? isFirst,
      createdAt: now,
      updatedAt: now,
    };
    if (portfolio.isDefault) {
      await this.clearDefault(userId);
    }
    return this.repos.portfolios.create(portfolio);
  }

  private async clearDefault(userId: string): Promise<void> {
    const existing = await this.repos.portfolios.list(userId);
    await Promise.all(
      existing
        .filter((p) => p.isDefault)
        .map((p) => this.repos.portfolios.update(p.portfolioId, { isDefault: false })),
    );
  }

  async list(userId = DEFAULT_USER_ID): Promise<Portfolio[]> {
    return this.repos.portfolios.list(userId);
  }

  async get(portfolioId: string): Promise<Portfolio | null> {
    return this.repos.portfolios.findById(portfolioId);
  }

  /** Returns the default portfolio, creating one on first use (FR-030). */
  async ensureDefault(userId = DEFAULT_USER_ID): Promise<Portfolio> {
    const existing = await this.repos.portfolios.findDefault(userId);
    if (existing) return existing;
    return this.create({ name: "전체 자산", userId, isDefault: true, baseCurrency: "KRW" });
  }

  async update(
    portfolioId: string,
    patch: Partial<Pick<Portfolio, "name" | "baseCurrency" | "isDefault">>,
  ): Promise<Portfolio | null> {
    if (patch.isDefault) {
      const current = await this.repos.portfolios.findById(portfolioId);
      if (current) await this.clearDefault(current.userId);
    }
    return this.repos.portfolios.update(portfolioId, patch);
  }
}
