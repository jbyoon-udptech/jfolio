import { NextResponse } from "next/server";
import { AUTH_URL } from "@/lib/auth-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FORWARDED_HEADERS = [
  "content-type",
  "accept",
  "user-agent",
  "cookie",
  "x-csrf-token",
  "x-forwarded-for",
  "x-real-ip",
];

/**
 * Same-origin proxy for `/api/auth/*`.
 *
 * The API issues the HttpOnly session cookie, so the browser must talk to the
 * Next.js origin rather than the API port. This handler forwards cookies and
 * the double-submit CSRF header, then relays every `Set-Cookie` header back so
 * login, logout and session expiry behave exactly as the API intends.
 */
async function proxy(
  request: Request,
  { params }: { params: { path: string[] } },
): Promise<NextResponse> {
  const path = params.path.map((segment) => encodeURIComponent(segment)).join("/");
  const incomingUrl = new URL(request.url);
  const target = `${AUTH_URL.replace(/\/$/, "")}/${path}${incomingUrl.search}`;

  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Make Secure-cookie decisions work when Next.js terminates TLS in front of
  // the API. Prefer the original client protocol from the reverse proxy.
  headers.set(
    "x-forwarded-proto",
    request.headers.get("x-forwarded-proto") ?? incomingUrl.protocol.replace(":", ""),
  );

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.text();
  if (body && !headers.has("content-type")) headers.set("content-type", "application/json");

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body: body || undefined,
      cache: "no-store",
      redirect: "manual",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Auth service unavailable";
    return NextResponse.json(
      { error: { code: "UNAVAILABLE", message: `Auth service unavailable: ${message}` } },
      { status: 503 },
    );
  }

  const responseHeaders = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) responseHeaders.set("content-type", contentType);
  responseHeaders.set("cache-control", "no-store");

  const withGetSetCookie = upstream.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies =
    typeof withGetSetCookie.getSetCookie === "function"
      ? withGetSetCookie.getSetCookie()
      : [];
  if (setCookies.length > 0) {
    for (const cookie of setCookies) responseHeaders.append("set-cookie", cookie);
  } else {
    // Fallback for runtimes without `getSetCookie`. Splitting is unsafe in
    // general (Expires contains a comma), so only use a single header.
    const single = upstream.headers.get("set-cookie");
    if (single) responseHeaders.append("set-cookie", single);
  }

  const payload = upstream.status === 204 ? null : await upstream.arrayBuffer();
  return new NextResponse(payload, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function GET(
  request: Request,
  context: { params: { path: string[] } },
): Promise<NextResponse> {
  return proxy(request, context);
}

export async function POST(
  request: Request,
  context: { params: { path: string[] } },
): Promise<NextResponse> {
  return proxy(request, context);
}
