import type { Request } from "express";
import type { z, ZodTypeAny } from "zod";
import { badRequest, validationError } from "./http-error";

/** Parse and validate a request body, throwing the standard validation error. */
export function parseBody<S extends ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    throw validationError("Request body validation failed", result.error.flatten());
  }
  return result.data;
}

/** Parse and validate query-string parameters. */
export function parseQuery<S extends ZodTypeAny>(schema: S, query: unknown): z.infer<S> {
  const result = schema.safeParse(query ?? {});
  if (!result.success) {
    throw validationError("Query parameter validation failed", result.error.flatten());
  }
  return result.data;
}

/** Read a required path parameter. */
export function pathParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value) throw badRequest(`Missing path parameter: ${name}`);
  return value;
}
