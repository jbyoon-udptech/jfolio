import { Router } from "express";
import { assetTypeSchema, currencyCode, type AssetType } from "@jfolio/shared";
import { z } from "zod";
import type { Container } from "../../container";
import { asyncHandler } from "../middleware";
import { parseBody, parseQuery } from "../validate";

const collectionRunBody = z.object({
  assetTypes: z.array(assetTypeSchema).optional(),
  instrumentIds: z.array(z.string().min(1)).optional(),
});

const fxRateQuery = z.object({
  baseCurrency: currencyCode.optional(),
  referenceCurrency: currencyCode.optional(),
});

/** SPEC 8.7: Operational endpoints. Health is public; the rest require auth. */
export function createSystemRouter(container: Container): Router {
  const router = Router();
  const startedAt = Date.now();

  router.get(
    "/health",
    asyncHandler(async (_req, res) => {
      res.json({
        status: "ok",
        service: "@jfolio/api",
        environment: container.config.nodeEnv,
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      });
    }),
  );

  router.get(
    "/data-status",
    asyncHandler(async (_req, res) => {
      const status = await container.system.getDataStatus();
      res.json(status);
    }),
  );

  router.get(
    "/providers",
    asyncHandler(async (_req, res) => {
      const providers = await container.system.getProviders();
      res.json({ items: providers, total: providers.length });
    }),
  );

  // The web shell renders this under the page header so every page shows the
  // same reference rate and observation time for foreign-currency assets.
  router.get(
    "/fx-rate",
    asyncHandler(async (req, res) => {
      const query = parseQuery(fxRateQuery, req.query);
      const baseCurrency = query.baseCurrency ?? container.config.baseCurrency;
      const referenceCurrency = query.referenceCurrency ?? "USD";
      res.json(
        await container.system.getReferenceFxRate(baseCurrency, referenceCurrency),
      );
    }),
  );

  // SPEC 8.7: manual collection trigger. Auth middleware already guards this
  // route when API_AUTH_TOKEN is configured.
  router.post(
    "/collection/run",
    asyncHandler(async (req, res) => {
      const body = parseBody(collectionRunBody, req.body);
      const result = await container.collection.run({
        assetTypes: body.assetTypes as AssetType[] | undefined,
        instrumentIds: body.instrumentIds,
      });
      res.json(result);
    }),
  );

  return router;
}
