import { Router } from "express";
import { currencyCode } from "@jfolio/shared";
import { z } from "zod";
import type { Container } from "../../container";
import { notFound } from "../http-error";
import { asyncHandler } from "../middleware";
import { parseQuery } from "../validate";

const dashboardQuery = z.object({
  portfolioId: z.string().min(1).optional(),
  baseCurrency: currencyCode.optional(),
});

/**
 * SPEC 8.2: Aggregated dashboard. When no `portfolioId` is supplied the user's
 * default portfolio is used (creating it on first access, FR-030).
 */
export function createDashboardRouter(container: Container): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const query = parseQuery(dashboardQuery, req.query);
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

  return router;
}
