/**
 * Redirect target used by the auth proxy.
 *
 * `next start -H <host>` makes Next.js derive the proxy request URL from
 * the server's internal bind address, so cloning `request.nextUrl` produces an
 * absolute URL such as `https://localhost:3000/login` behind a reverse proxy.
 * The header-based origin below keeps the public hostname instead, so the
 * absolute redirect target never points at the internal bind address.
 */

/** First entry of a comma-separated forwarding header (`a, b`), trimmed. */
function firstValue(value: string | null): string | undefined {
  const first = value?.split(",")[0]?.trim();
  return first ? first : undefined;
}

/**
 * Public origin of the current request: `X-Forwarded-Proto`/`X-Forwarded-Host`
 * (set by the reverse proxy) win over `Host`, and the proxy's own URL is
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
