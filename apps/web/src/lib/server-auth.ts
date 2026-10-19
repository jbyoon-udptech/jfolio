import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { ERROR_CODES, type AuthUser, type ErrorCode } from "@jfolio/shared";
import { authApi } from "./api";
import { AUTH_REQUIRED, CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from "./auth-config";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Error that route handlers turn into the API's standard error envelope. */
export class AuthGuardError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: ErrorCode,
  ) {
    super(message);
    this.name = "AuthGuardError";
  }
}

function tokensMatch(expected: string, actual: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Double-submit CSRF check for browser mutations that pass through Next.js.
 * The API enforces the same rule; checking here as well keeps the protection
 * in place even if the service token later becomes the only API credential.
 */
export function assertCsrf(request: Request): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;

  const expected = cookies().get(CSRF_COOKIE_NAME)?.value;
  const supplied = request.headers.get("x-csrf-token") ?? "";
  if (!expected || !supplied || !tokensMatch(expected, supplied)) {
    throw new AuthGuardError(
      403,
      "A valid CSRF token is required",
      ERROR_CODES.FORBIDDEN,
    );
  }
}

/**
 * Gate for every Next.js mutation route. A browser must present a valid
 * server-side session; the API service token is never sufficient here because
 * the Next.js server attaches it to every upstream request.
 *
 * When `AUTH_REQUIRED=false` (legacy/no-auth mode) anonymous mutations remain
 * possible, but an existing session is still validated and CSRF-checked.
 */
export async function guardMutation(request: Request): Promise<AuthUser | null> {
  const sessionCookie = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) {
    if (!AUTH_REQUIRED) return null;
    throw new AuthGuardError(
      401,
      "Authentication required",
      ERROR_CODES.UNAUTHORIZED,
    );
  }

  const me = await authApi.me();
  if (!me.authenticated) {
    if (!AUTH_REQUIRED) return null;
    throw new AuthGuardError(
      401,
      "Authentication required",
      ERROR_CODES.UNAUTHORIZED,
    );
  }

  assertCsrf(request);
  return me.user;
}

/** Server-side page guard used by the protected `(app)` layout. */
export async function currentUser(): Promise<AuthUser | null> {
  if (!AUTH_REQUIRED) return null;
  if (!cookies().get(SESSION_COOKIE_NAME)?.value) return null;
  const me = await authApi.me();
  return me.authenticated ? me.user : null;
}
