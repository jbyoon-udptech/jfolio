/**
 * Web-side authentication settings shared by the Next.js server, proxy
 * and route handlers. Kept free of Node-only imports so the proxy can read the
 * same cookie names and flags.
 */

const API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:3001/api/v1";

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

/**
 * Whether browser pages and mutations require a signed-in user. Defaults to
 * true; set `AUTH_REQUIRED=false` only for local development or legacy
 * deployments that intentionally run without accounts.
 */
export const AUTH_REQUIRED = flag(process.env.AUTH_REQUIRED, true);

/** Session cookie issued by the API and relayed by the auth proxy. */
export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "jfolio.sid";

/** Readable double-submit CSRF cookie issued by the API. */
export const CSRF_COOKIE_NAME = process.env.AUTH_CSRF_COOKIE_NAME || "jfolio.csrf";

/** Auth endpoints live outside the versioned API path. */
export const AUTH_URL =
  process.env.API_AUTH_URL ?? API_BASE_URL.replace(/\/api\/v1\/?$/, "/api/auth");

/** Server-side API base URL (used by the data client). */
export const API_URL = API_BASE_URL;
