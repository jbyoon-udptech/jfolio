import { Router } from "express";
import {
  createSignalRuleSchema,
  listSignalEventsQuery,
  updateSignalRuleSchema,
} from "@jfolio/shared";
import type { Container } from "../../container";
import { notFound } from "../http-error";
import { asyncHandler } from "../middleware";
import { parseBody, parseQuery, pathParam } from "../validate";

/** SPEC 8.6: Signal rule and event endpoints. */
export function createSignalsRouter(container: Container): Router {
  const router = Router();

  router.get(
    "/rules",
    asyncHandler(async (req, res) => {
      const isEnabled =
        req.query.isEnabled === undefined
          ? undefined
          : req.query.isEnabled === "true" || req.query.isEnabled === "1";
      const rules = await container.signals.listRules({
        portfolioId: typeof req.query.portfolioId === "string" ? req.query.portfolioId : undefined,
        instrumentId:
          typeof req.query.instrumentId === "string" ? req.query.instrumentId : undefined,
        isEnabled,
      });
      res.json({ items: rules, total: rules.length });
    }),
  );

  router.post(
    "/rules",
    asyncHandler(async (req, res) => {
      const body = parseBody(createSignalRuleSchema, req.body);
      const rule = await container.signals.createRule(body);
      res.status(201).json(rule);
    }),
  );

  router.get(
    "/rules/:id",
    asyncHandler(async (req, res) => {
      const id = pathParam(req, "id");
      const rule = await container.signals.getRule(id);
      if (!rule) throw notFound(`Signal rule ${id} not found`);
      res.json(rule);
    }),
  );

  router.patch(
    "/rules/:id",
    asyncHandler(async (req, res) => {
      const id = pathParam(req, "id");
      const patch = parseBody(updateSignalRuleSchema, req.body);
      const updated = await container.signals.updateRule(id, patch);
      if (!updated) throw notFound(`Signal rule ${id} not found`);
      res.json(updated);
    }),
  );

  // SPEC 8.6: DELETE deactivates rather than removing, preserving event history.
  router.delete(
    "/rules/:id",
    asyncHandler(async (req, res) => {
      const id = pathParam(req, "id");
      const disabled = await container.signals.disableRule(id);
      if (!disabled) throw notFound(`Signal rule ${id} not found`);
      res.json({ deactivated: true, rule: disabled });
    }),
  );

  router.get(
    "/events",
    asyncHandler(async (req, res) => {
      const query = parseQuery(listSignalEventsQuery, req.query);
      const { items, total } = await container.signals.listEvents({
        ruleId: query.ruleId,
        instrumentId: query.instrumentId,
        portfolioId: query.portfolioId,
        status: query.status,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        limit: query.limit,
        offset: query.offset,
      });
      res.json({ items, total, limit: query.limit, offset: query.offset });
    }),
  );

  return router;
}
