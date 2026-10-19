import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { AppConfig } from "../config";
import type { UserRepository } from "../users/user.repository";
import { forbidden, unauthorized } from "../api/http-error";
import { asyncHandler } from "../api/middleware";
import { createCsrfToken, setCsrfCookie } from "./session";
import { SESSION_COOKIE_SAFE_METHODS } from "./auth.types";

function tokensMatch(expected: string, actual: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

function readApiToken(req: Request): string | undefined {
  const header = req.header("authorization");
  const bearer = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : undefined;
  return bearer ?? req.header("x-api-key") ?? undefined;
}

/**
 * Resolve the authenticated user from the server-side session. Runs before
 * every route so `/api/auth/me` and the protected API share one source of
 * truth. Disabled or deleted accounts lose their session immediately.
 */
export function attachSessionUser(repos: UserRepository, config: AppConfig): RequestHandler {
  return asyncHandler(async (req, res, next) => {
    const userId = req.session?.userId;
    if (!userId) {
      next();
      return;
    }

    const user = await repos.findById(userId);
    if (!user || user.status !== "active") {
      req.session.destroy(() => undefined);
      res.clearCookie(config.auth.session.cookieName, { path: "/" });
      next();
      return;
    }

    req.user = user;
    req.authMethod = "session";
    next();
  });
}

/**
 * Create the CSRF token for sessions that need one and publish it in a
 * readable cookie. Requests that only use the API token never create a
 * session, so service-to-service calls do not accumulate empty sessions.
 */
export function ensureCsrfToken(config: AppConfig): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authRoute = req.path.startsWith("/api/auth");
    if (!req.session || (!req.session.userId && !authRoute)) {
      next();
      return;
    }

    if (!req.session.csrfToken) {
      req.session.csrfToken = createCsrfToken();
    }
    setCsrfCookie(res, config, req.session.csrfToken);
    next();
  };
}

/**
 * Session-or-token authentication for `/api/v1`.
 *
 * `API_AUTH_TOKEN` is retained as a trusted service credential so the Next.js
 * server can call the API without a browser session. Browsers authenticate
 * with the session cookie. When `AUTH_REQUIRED` is false (local development /
 * legacy tests) unauthenticated requests pass through unchanged.
 */
export function requireAuth(config: AppConfig): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.path === "/health" || req.path === "/system/health") {
      next();
      return;
    }

    const expectedToken = config.api.authToken;
    if (expectedToken) {
      const supplied = readApiToken(req);
      if (supplied && tokensMatch(expectedToken, supplied)) {
        req.authMethod = "api-token";
        next();
        return;
      }
    }

    if (req.user) {
      req.authMethod = "session";
      next();
      return;
    }

    if (config.auth.required || expectedToken) {
      next(unauthorized("Authentication required"));
      return;
    }

    next();
  };
}

/**
 * Double-submit CSRF protection. Only session-cookie requests are checked:
 * API-token calls carry no ambient browser credential and are therefore not
 * vulnerable to CSRF. Safe methods are always allowed.
 */
export function requireCsrf(
  config: AppConfig,
  options: { force?: boolean } = {},
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (SESSION_COOKIE_SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    if (req.authMethod === "api-token") {
      next();
      return;
    }

    // When authentication is optional, legacy unauthenticated callers have no
    // session to protect. Auth routes pass `force` so login/logout still check.
    const sessionAuth = req.authMethod === "session" || Boolean(req.session?.userId);
    if (!sessionAuth && !options.force) {
      next();
      return;
    }

    const expected = req.session?.csrfToken;
    const supplied = req.header("x-csrf-token");
    if (!expected || !supplied || !tokensMatch(expected, supplied)) {
      next(forbidden("A valid CSRF token is required"));
      return;
    }
    // Keep the readable cookie in sync if it was lost but the server session
    // still has a valid token.
    setCsrfCookie(res, config, expected);
    next();
  };
}
