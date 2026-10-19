import cors from "cors";
import express, { type Express } from "express";
import type { AppConfig } from "../config";
import type { Container } from "../container";
import {
  attachSessionUser,
  ensureCsrfToken,
  requireAuth,
  requireCsrf,
} from "../auth/auth.middleware";
import { createSessionMiddleware } from "../auth/session";
import { createAuthRouter } from "./auth-routes";
import { errorHandler, notFoundHandler } from "./middleware";
import { createApiRouter } from "./routes";

/**
 * SPEC 8.1: Builds the Express application. Kept separate from `index.ts` so
 * tests can mount the app without opening a real port.
 */
export function createApp(container: Container, config: AppConfig = container.config): Express {
  const app = express();

  app.disable("x-powered-by");
  if (config.auth.session.trustProxy) {
    // Only enable when the API is reachable exclusively through a trusted
    // reverse proxy (Next.js); otherwise clients could spoof X-Forwarded-*.
    app.set("trust proxy", true);
  }
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  // Public liveness probe (no auth) for load balancers / container health.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "@jfolio/api", timestamp: new Date().toISOString() });
  });

  const authEnabled =
    config.auth.required || config.auth.localEnabled || config.auth.googleEnabled;

  if (authEnabled) {
    app.use(createSessionMiddleware(config));
    app.use(attachSessionUser(container.repos.users, config));
    app.use(ensureCsrfToken(config));
    app.use("/api/auth", createAuthRouter(container, config));
  }

  // Versioned API. The API token remains valid as a trusted service
  // credential; browsers authenticate with the server-side session.
  const apiRouter = createApiRouter(container);
  app.use(
    config.api.basePath,
    requireAuth(config),
    requireCsrf(config),
    apiRouter,
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
