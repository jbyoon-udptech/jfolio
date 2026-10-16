import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ERROR_CODES } from "@jfolio/shared";
import { HttpError } from "./http-error";
import { ConflictError, NotFoundError, ValidationError } from "../services/errors";

/** Wrap async route handlers so rejections reach the error middleware. */
export function asyncHandler<T extends Request>(
  handler: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req as T, res, next)).catch(next);
  };
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: { code: ERROR_CODES.NOT_FOUND, message: "Route not found" },
  });
}

/** SPEC 8.1: consistent error envelope for every failure. */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }
  if (error instanceof ZodError) {
    res.status(422).json({
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Request validation failed",
        details: error.flatten(),
      },
    });
    return;
  }
  if (error instanceof NotFoundError) {
    res.status(404).json({ error: { code: ERROR_CODES.NOT_FOUND, message: error.message } });
    return;
  }
  if (error instanceof ValidationError) {
    res.status(422).json({ error: { code: ERROR_CODES.VALIDATION_ERROR, message: error.message } });
    return;
  }
  if (error instanceof ConflictError) {
    res.status(409).json({ error: { code: ERROR_CODES.CONFLICT, message: error.message } });
    return;
  }
  const message = error instanceof Error ? error.message : "Unexpected error";
  // eslint-disable-next-line no-console
  console.error("[api] unhandled error:", error);
  res.status(500).json({ error: { code: ERROR_CODES.INTERNAL, message } });
}
