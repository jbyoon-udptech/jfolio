import { CSRF_COOKIE_NAME } from "@/lib/auth-config";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_HEADER = "x-csrf-token";

/** Read the readable double-submit cookie set by the API. */
export function readCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${CSRF_COOKIE_NAME}=`;
  for (const part of document.cookie.split(";")) {
    const entry = part.trim();
    if (entry.startsWith(prefix)) {
      return decodeURIComponent(entry.slice(prefix.length));
    }
  }
  return null;
}

/**
 * Ensure a CSRF token exists before a mutation. Normally the login page or the
 * API has already issued the cookie; the fallback bootstraps one for sessions
 * that were created before the cookie reached the browser.
 */
export async function ensureCsrfToken(): Promise<string | null> {
  const existing = readCsrfToken();
  if (existing) return existing;

  try {
    const res = await fetch("/api/auth/csrf", { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { token?: string | null };
    return body.token ?? readCsrfToken();
  } catch {
    return null;
  }
}

/**
 * `fetch` wrapper for browser mutations. Same-origin cookies are sent
 * automatically and the CSRF header is added for unsafe methods so requests
 * pass both the Next.js and API double-submit checks.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (!SAFE_METHODS.has(method)) {
    const token = await ensureCsrfToken();
    if (token) headers.set(CSRF_HEADER, token);
  }
  return fetch(input, {
    ...init,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
}
