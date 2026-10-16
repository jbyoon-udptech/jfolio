import { ERROR_CODES, type ErrorCode } from "@jfolio/shared";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, ERROR_CODES.BAD_REQUEST, message, details);

export const validationError = (message: string, details?: unknown) =>
  new HttpError(422, ERROR_CODES.VALIDATION_ERROR, message, details);

export const notFound = (message: string) =>
  new HttpError(404, ERROR_CODES.NOT_FOUND, message);

export const conflict = (message: string) =>
  new HttpError(409, ERROR_CODES.CONFLICT, message);

export const unauthorized = (message = "Authentication required") =>
  new HttpError(401, ERROR_CODES.UNAUTHORIZED, message);

export const unavailable = (message: string, details?: unknown) =>
  new HttpError(503, ERROR_CODES.UNAVAILABLE, message, details);
