import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { ERROR_CODES, loginSchema } from "@jfolio/shared";
import { toAuthUser } from "../users/user.types";
import type { AppConfig } from "../config";
import type { Container } from "../container";
import { asyncHandler } from "../api/middleware";
import { forbidden, rateLimited, unauthorized } from "../api/http-error";
import { parseBody } from "../api/validate";
import { requireCsrf } from "../auth/auth.middleware";
import {
  clearAuthCookies,
  createCsrfToken,
  destroySession,
  regenerateSession,
  saveSession,
  setCsrfCookie,
} from "../auth/session";

function normalizeRateLimitEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, 254) : "";
}

/**
 * SPEC AUTH-001..AUTH-009 HTTP surface. The router is mounted at `/api/auth`
 * (outside the versioned API) so it is not shadowed by the API-token gate.
 */
export function createAuthRouter(container: Container, config: AppConfig = container.config): Router {
  const router = Router();

  const loginLimiter = rateLimit({
    windowMs: config.auth.loginRateLimit.windowMs,
    limit: config.auth.loginRateLimit.max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // Per client + account. The email component prevents one noisy IP from
    // locking out unrelated users while still stopping password spraying.
    keyGenerator: (req) => {
      const ip = ipKeyGenerator(req.ip ?? "");
      const email = normalizeRateLimitEmail((req.body as { email?: unknown } | undefined)?.email);
      return `${ip}:${email}`;
    },
    handler: (_req, res) => {
      const error = rateLimited("Too many login attempts. Try again later.");
      res.status(429).json({
        error: { code: ERROR_CODES.RATE_LIMITED, message: error.message },
      });
    },
  });

  router.use((_req, res, next) => {
    res.set("cache-control", "no-store");
    next();
  });

  /** Bootstraps the double-submit cookie before the login form is submitted. */
  router.get("/csrf", (req, res) => {
    res.json({ token: req.session?.csrfToken ?? null });
  });

  router.get("/me", (req, res) => {
    res.json({
      authenticated: Boolean(req.user),
      user: req.user ? toAuthUser(req.user) : null,
    });
  });

  /** Lets the login page decide which providers to render. */
  router.get("/providers", (_req, res) => {
    res.json({ local: config.auth.localEnabled, google: config.auth.googleEnabled });
  });

  router.post(
    "/login",
    loginLimiter,
    requireCsrf(config, { force: true }),
    asyncHandler(async (req, res) => {
      if (!config.auth.localEnabled) {
        throw forbidden("Local email/password login is disabled");
      }

      const input = parseBody(loginSchema, req.body);
      const user = await container.auth.loginWithLocal(input.email, input.password);
      if (!user) {
        // Deliberately identical for unknown email, wrong password and
        // disabled account to avoid user enumeration (SPEC AUTH-004).
        throw unauthorized("Invalid email or password");
      }

      // Session fixation protection: issue a brand-new session id on login.
      await regenerateSession(req);
      req.session.userId = user.userId;
      req.session.csrfToken = createCsrfToken();
      await saveSession(req);

      req.user = user;
      req.authMethod = "session";
      setCsrfCookie(res, config, req.session.csrfToken);
      res.json({ success: true, user: toAuthUser(user) });
    }),
  );

  router.post(
    "/logout",
    requireCsrf(config, { force: true }),
    asyncHandler(async (req, res) => {
      if (req.session) {
        await destroySession(req);
      }
      clearAuthCookies(res, config);
      res.json({ success: true });
    }),
  );

  return router;
}
