import { Router } from "express";
import type { Container } from "../../container";
import { createAssetsRouter } from "./assets";
import { createDashboardRouter } from "./dashboard";
import { createPortfoliosRouter } from "./portfolios";
import { createSignalsRouter } from "./signals";
import { createSystemRouter } from "./system";
import { createTransactionsRouter } from "./transactions";

/**
 * SPEC 8: Mounts every versioned API router under the configured base path.
 * `health` is repeated here (in addition to the root health probe) so the
 * service can be monitored either at `/health` or `/api/v1/system/health`.
 */
export function createApiRouter(container: Container): Router {
  const router = Router();

  router.use("/assets", createAssetsRouter(container));
  router.use("/portfolios", createPortfoliosRouter(container));
  router.use("/transactions", createTransactionsRouter(container));
  router.use("/signals", createSignalsRouter(container));
  router.use("/dashboard", createDashboardRouter(container));
  router.use("/system", createSystemRouter(container));

  return router;
}
