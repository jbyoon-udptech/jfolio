import { Router } from "express";
import {
  createTransactionSchema,
  listTransactionsQuery,
  updateTransactionSchema,
} from "@jfolio/shared";
import type { Container } from "../../container";
import { notFound } from "../http-error";
import { asyncHandler } from "../middleware";
import { parseBody, parseQuery, pathParam } from "../validate";

/** SPEC 8.5: Transaction ledger endpoints. */
export function createTransactionsRouter(container: Container): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const query = parseQuery(listTransactionsQuery, req.query);
      const { items, total } = await container.transactions.list({
        portfolioId: query.portfolioId,
        instrumentId: query.instrumentId,
        type: query.type,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        limit: query.limit,
        offset: query.offset,
      });
      res.json({ items, total, limit: query.limit, offset: query.offset });
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const body = parseBody(createTransactionSchema, req.body);
      const transaction = await container.transactions.create(body);
      res.status(201).json(transaction);
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = pathParam(req, "id");
      const transaction = await container.transactions.get(id);
      if (!transaction) throw notFound(`Transaction ${id} not found`);
      res.json(transaction);
    }),
  );

  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = pathParam(req, "id");
      const patch = parseBody(updateTransactionSchema, req.body);
      const updated = await container.transactions.update(id, patch);
      res.json(updated);
    }),
  );

  // FR-034: deleting a transaction invalidates later snapshots and forces
  // positions to be recomputed from the ledger.
  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = pathParam(req, "id");
      await container.transactions.delete(id);
      res.status(204).end();
    }),
  );

  return router;
}
