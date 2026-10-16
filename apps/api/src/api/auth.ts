import type { NextFunction, Request, Response } from "express";
import { unauthorized } from "./http-error";

/**
 * NFR-003: Optional shared-secret auth. Enabled only when API_AUTH_TOKEN is
 * configured; health checks remain public.
 */
export function createAuthMiddleware(token: string | null) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!token) {
      next();
      return;
    }
    if (req.path === "/health" || req.path === "/system/health") {
      next();
      return;
    }
    const header = req.header("authorization");
    const bearer = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : undefined;
    const apiKey = req.header("x-api-key") ?? undefined;
    if (bearer === token || apiKey === token) {
      next();
      return;
    }
    next(unauthorized("A valid API token is required"));
  };
}
