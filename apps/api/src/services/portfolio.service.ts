import type { Portfolio } from "@jfolio/shared";
import { newId } from "../domain/ids";
import type { Repositories } from "../repositories/types";
import { ConflictError } from "./errors";

export interface CreatePortfolioInput {
  name: string;
  baseCurrency?: string;
  isDefault?: boolean;
  userId?: string;
}

export const DEFAULT_USER_ID = "default-user";

/** Documents created before `isHidden` existed are treated as visible. */
function withDefaults(portfolio: Portfolio): Portfolio {
  return { ...portfolio, isHidden: portfolio.isHidden ?? false };
}

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
      isHidden: false,
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
    const items = await this.repos.portfolios.list(userId);
    return items.map(withDefaults);
  }

  /**
   * Portfolios for lists and selectors. Hidden portfolios remain addressable by
   * ID so the management page can restore them, but they are not listed.
   */
  async listVisible(userId = DEFAULT_USER_ID): Promise<Portfolio[]> {
    const items = await this.list(userId);
    return items.filter((portfolio) => !portfolio.isHidden);
  }

  async get(portfolioId: string): Promise<Portfolio | null> {
    const portfolio = await this.repos.portfolios.findById(portfolioId);
    return portfolio ? withDefaults(portfolio) : null;
  }

  /** Returns the default portfolio, creating one on first use (FR-030). */
  async ensureDefault(userId = DEFAULT_USER_ID): Promise<Portfolio> {
    const existing = await this.repos.portfolios.findDefault(userId);
    if (existing) {
      const portfolio = withDefaults(existing);
      if (!portfolio.isHidden) return portfolio;
      // A default portfolio is always visible; repair legacy hidden defaults.
      const updated = await this.repos.portfolios.update(portfolio.portfolioId, {
        isHidden: false,
      });
      return updated ? withDefaults(updated) : { ...portfolio, isHidden: false };
    }
    return this.create({ name: "전체 자산", userId, isDefault: true, baseCurrency: "KRW" });
  }

  async update(
    portfolioId: string,
    patch: Partial<Pick<Portfolio, "name" | "baseCurrency" | "isDefault" | "isHidden">>,
  ): Promise<Portfolio | null> {
    const current = await this.repos.portfolios.findById(portfolioId);
    if (!current) return null;
    if (patch.isHidden === true && current.isDefault) {
      throw new ConflictError("Default portfolio cannot be hidden");
    }
    // Promoting a hidden portfolio to default also makes it visible again.
    const nextPatch = patch.isDefault ? { ...patch, isHidden: false } : patch;
    if (nextPatch.isDefault) {
      await this.clearDefault(current.userId);
    }
    const updated = await this.repos.portfolios.update(portfolioId, nextPatch);
    return updated ? withDefaults(updated) : null;
  }
}
