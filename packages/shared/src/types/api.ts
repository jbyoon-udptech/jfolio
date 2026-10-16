/** Consistent error envelope for all REST API failures (SPEC 8.1). */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export const ERROR_CODES = {
  BAD_REQUEST: "BAD_REQUEST",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  RATE_LIMITED: "RATE_LIMITED",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  UNAVAILABLE: "UNAVAILABLE",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
