/**
 * Redirect target used by the auth middleware.
 *
 * `next start -H <host>` makes Next.js derive the middleware request URL from
 * the server's internal bind address, so cloning `request.nextUrl` produces an
 * absolute URL such as `https://localhost:3000/login` behind a reverse proxy.
 * The header-based origin below keeps the public hostname instead.
 *
 * A relative `Location` is not an option: Next 14's middleware adapter parses
 * the header with `new URL()` and fails with `Invalid URL`.
 */

/** First entry of a comma-separated forwarding header (`a, b`), trimmed. */
function firstValue(value: string | null): string | undefined {
  const first = value?.split(",")[0]?.trim();
  return first ? first : undefined;
}

/**
 * Public origin of the current request: `X-Forwarded-Proto`/`X-Forwarded-Host`
 * (set by the reverse proxy) win over `Host`, and the middleware's own URL is
 * the last resort (direct requests in dev).
 */
export function resolvePublicOrigin(
  forwardedProto: string | null,
  forwardedHost: string | null,
  hostHeader: string | null,
  fallbackOrigin: string,
): string {
  const fallback = new URL(fallbackOrigin);
  const proto =
    firstValue(forwardedProto) ?? fallback.protocol.replace(/:$/, "");
  const host =
    firstValue(forwardedHost) ?? firstValue(hostHeader) ?? fallback.host;
  return `${proto}://${host}`;
}

/** Absolute `/login` URL, carrying the original path as `next`. */
export function buildLoginUrl(
  origin: string,
  pathname: string,
  search = "",
): string {
  const url = new URL("/login", origin);
  if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
  return url.toString();
}
