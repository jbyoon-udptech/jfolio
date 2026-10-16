import { Router } from "express";
import {
  createPortfolioSchema,
  historyQuery,
  snapshotTypeSchema,
  valuationQuery,
} from "@jfolio/shared";
import { z } from "zod";
import type { Container } from "../../container";
import { notFound } from "../http-error";
import { asyncHandler } from "../middleware";
import { parseBody, parseQuery, pathParam } from "../validate";

const snapshotsQuery = z.object({
  snapshotType: snapshotTypeSchema.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(2000).optional(),
});

const createSnapshotBody = z.object({
  snapshotType: snapshotTypeSchema.optional().default("ON_DEMAND"),
  asOf: z.string().datetime({ offset: true }).optional(),
  baseCurrency: z.string().optional(),
});

/** SPEC 8.4: Portfolio endpoints. */
export function createPortfoliosRouter(container: Container): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const items = await container.portfolios.list();
      res.json({ items, total: items.length });
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const body = parseBody(createPortfolioSchema, req.body);
      const portfolio = await container.portfolios.create(body);
      res.status(201).json(portfolio);
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = pathParam(req, "id");
      const portfolio = await container.portfolios.get(id);
      if (!portfolio) throw notFound(`Portfolio ${id} not found`);
      res.json(portfolio);
    }),
  );

  router.get(
    "/:id/holdings",
    asyncHandler(async (req, res) => {
      const id = pathParam(req, "id");
      await requirePortfolio(container, id);
      const valuation = await container.valuation.valuate(id);
      res.json({
        portfolioId: id,
        baseCurrency: valuation.baseCurrency,
        asOf: valuation.asOf,
        dataStatus: valuation.dataStatus,
        unavailableCount: valuation.unavailableCount,
        items: valuation.positions,
        cashBalances: valuation.cashBalances,
      });
    }),
  );

  router.get(
    "/:id/valuation",
    asyncHandler(async (req, res) => {
      const id = pathParam(req, "id");
      await requirePortfolio(container, id);
      const query = parseQuery(valuationQuery, req.query);
      const valuation = await container.valuation.valuate(id, {
        baseCurrency: query.baseCurrency,
        asOf: query.asOf ? new Date(query.asOf) : undefined,
      });
      res.json(valuation);
    }),
  );

  router.get(
    "/:id/history",
    asyncHandler(async (req, res) => {
      const id = pathParam(req, "id");
      await requirePortfolio(container, id);
      const query = parseQuery(historyQuery, req.query);
      const to = query.to ? new Date(query.to) : new Date();
      const from = query.from
        ? new Date(query.from)
        : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
      const points = await container.valuation.historySeries(id, {
        baseCurrency: query.baseCurrency,
        from,
        to,
        interval: query.interval,
      });
      res.json({ portfolioId: id, interval: query.interval, from, to, items: points });
    }),
  );

  router.get(
    "/:id/snapshots",
    asyncHandler(async (req, res) => {
      const id = pathParam(req, "id");
      await requirePortfolio(container, id);
      const query = parseQuery(snapshotsQuery, req.query);
      const items = await container.snapshots.list(id, {
        snapshotType: query.snapshotType,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        limit: query.limit,
      });
      res.json({ items, total: items.length });
    }),
  );

  // FR-051: on-demand snapshot creation.
  router.post(
    "/:id/snapshots",
    asyncHandler(async (req, res) => {
      const id = pathParam(req, "id");
      await requirePortfolio(container, id);
      const body = parseBody(createSnapshotBody, req.body);
      const snapshot = await container.snapshots.createSnapshot({
        portfolioId: id,
        snapshotType: body.snapshotType,
        asOf: body.asOf ? new Date(body.asOf) : undefined,
        baseCurrency: body.baseCurrency,
      });
      res.status(201).json(snapshot);
    }),
  );

  return router;
}

async function requirePortfolio(container: Container, id: string) {
  const portfolio = await container.portfolios.get(id);
  if (!portfolio) throw notFound(`Portfolio ${id} not found`);
  return portfolio;
}
