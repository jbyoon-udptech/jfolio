import cors from "cors";
import express, { type Express } from "express";
import type { AppConfig } from "../config";
import type { Container } from "../container";
import { createAuthMiddleware } from "./auth";
import { errorHandler, notFoundHandler } from "./middleware";
import { createApiRouter } from "./routes";

/**
 * SPEC 8.1: Builds the Express application. Kept separate from `index.ts` so
 * tests can mount the app without opening a real port.
 */
export function createApp(container: Container, config: AppConfig = container.config): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  // Public liveness probe (no auth) for load balancers / container health.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "@jfolio/api", timestamp: new Date().toISOString() });
  });

  // Versioned API. Auth is mounted inside the router so `req.path` is relative
  // to the base path and health routes stay exempt.
  const apiRouter = createApiRouter(container);
  app.use(config.api.basePath, createAuthMiddleware(config.api.authToken), apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
