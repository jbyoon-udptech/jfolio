import { Router } from "express";
import {
  ALL_PORTFOLIOS_ID,
  DEFAULT_BASE_CURRENCY,
  currencyCode,
  historyQuery,
  type Portfolio,
} from "@jfolio/shared";
import { z } from "zod";
import type { Container } from "../../container";
import { notFound } from "../http-error";
import { asyncHandler } from "../middleware";
import { parseQuery } from "../validate";

const DAY_MS = 24 * 60 * 60 * 1000;

const dashboardQuery = z.object({
  portfolioId: z.string().min(1).optional(),
  baseCurrency: currencyCode.optional(),
});

const dashboardHistoryQuery = historyQuery.extend({
  portfolioId: z.string().min(1).optional(),
});

/**
 * SPEC 8.2: Aggregated dashboard. When no `portfolioId` is supplied the user's
 * default portfolio is used (creating it on first access, FR-030). The special
 * id `all` aggregates every visible portfolio in one base currency.
 */
export function createDashboardRouter(container: Container): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const query = parseQuery(dashboardQuery, req.query);

      if (query.portfolioId === ALL_PORTFOLIOS_ID) {
        const portfolios = await visiblePortfolios(container);
        const dashboard = await container.dashboard.getDashboardForAll(
          portfolios.map((portfolio) => portfolio.portfolioId),
          { baseCurrency: baseCurrencyFor(portfolios, query.baseCurrency) },
        );
        res.json(dashboard);
        return;
      }

      const portfolio = query.portfolioId
        ? await container.portfolios.get(query.portfolioId)
        : await container.portfolios.ensureDefault();
      if (!portfolio) throw notFound(`Portfolio ${query.portfolioId} not found`);
      const dashboard = await container.dashboard.getDashboard(portfolio.portfolioId, {
        baseCurrency: query.baseCurrency,
      });
      res.json(dashboard);
    }),
  );

  // The dashboard chart can aggregate all visible portfolios or show one.
  router.get(
    "/history",
    asyncHandler(async (req, res) => {
      const query = parseQuery(dashboardHistoryQuery, req.query);
      const to = query.to ? new Date(query.to) : new Date();
      const from = query.from
        ? new Date(query.from)
        : new Date(to.getTime() - 30 * DAY_MS);
      const portfolioId = query.portfolioId;

      if (!portfolioId || portfolioId === ALL_PORTFOLIOS_ID) {
        const portfolios = await visiblePortfolios(container);
        const points = await container.dashboard.getHistoryForAll(
          portfolios.map((portfolio) => portfolio.portfolioId),
          {
            baseCurrency: baseCurrencyFor(portfolios, query.baseCurrency),
            from,
            to,
            interval: query.interval,
          },
        );
        res.json({
          portfolioId: ALL_PORTFOLIOS_ID,
          interval: query.interval,
          from,
          to,
          items: points,
        });
        return;
      }

      const portfolio = await container.portfolios.get(portfolioId);
      if (!portfolio) throw notFound(`Portfolio ${portfolioId} not found`);
      const points = await container.valuation.historySeries(portfolioId, {
        baseCurrency: query.baseCurrency,
        from,
        to,
        interval: query.interval,
      });
      res.json({
        portfolioId,
        interval: query.interval,
        from,
        to,
        items: points,
      });
    }),
  );

  return router;
}

async function visiblePortfolios(container: Container): Promise<Portfolio[]> {
  // Repairs a legacy hidden default and guarantees at least one portfolio on
  // first access, matching the non-aggregate dashboard behaviour.
  await container.portfolios.ensureDefault();
  return container.portfolios.listVisible();
}

function baseCurrencyFor(portfolios: Portfolio[], requested?: string): string {
  return (
    requested ??
    portfolios.find((portfolio) => portfolio.isDefault)?.baseCurrency ??
    portfolios[0]?.baseCurrency ??
    DEFAULT_BASE_CURRENCY
  );
}
