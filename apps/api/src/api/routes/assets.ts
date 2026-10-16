import { Router } from "express";
import {
  createInstrumentSchema,
  listInstrumentsQuery,
  quotesQuery,
  updateInstrumentSchema,
  type DataInterval,
} from "@jfolio/shared";
import type { Container } from "../../container";
import { notFound } from "../http-error";
import { asyncHandler } from "../middleware";
import { parseBody, parseQuery, pathParam } from "../validate";

/** SPEC 8.3: Asset master endpoints. */
export function createAssetsRouter(container: Container): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const query = parseQuery(listInstrumentsQuery, req.query);
      const { items, total } = await container.instruments.list(query);
      res.json({ items, total, limit: query.limit, offset: query.offset });
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const body = parseBody(createInstrumentSchema, req.body);
      const instrument = await container.instruments.create(body);
      res.status(201).json(instrument);
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = pathParam(req, "id");
      const instrument = await container.instruments.get(id);
      if (!instrument) throw notFound(`Instrument ${id} not found`);
      const latestQuote = await container.marketData.getLatest(instrument.instrumentId);
      res.json({ ...instrument, latestQuote });
    }),
  );

  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = pathParam(req, "id");
      const body = parseBody(updateInstrumentSchema, req.body);
      const updated = await container.instruments.update(id, body);
      if (!updated) throw notFound(`Instrument ${id} not found`);
      res.json(updated);
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = pathParam(req, "id");
      const deactivated = await container.instruments.deactivate(id);
      if (!deactivated) throw notFound(`Instrument ${id} not found`);
      res.json({ deactivated: true, instrument: deactivated });
    }),
  );

  router.get(
    "/:id/quotes",
    asyncHandler(async (req, res) => {
      const id = pathParam(req, "id");
      const instrument = await container.instruments.get(id);
      if (!instrument) throw notFound(`Instrument ${id} not found`);
      const query = parseQuery(quotesQuery, req.query);
      const items = await container.marketData.getHistorical(instrument.instrumentId, {
        interval: query.interval as DataInterval | undefined,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        limit: query.limit,
      });
      res.json({ instrumentId: instrument.instrumentId, items, total: items.length });
    }),
  );

  return router;
}
