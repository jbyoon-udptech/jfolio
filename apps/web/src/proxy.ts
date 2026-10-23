import { NextResponse, type NextRequest } from "next/server";
import { AUTH_REQUIRED, SESSION_COOKIE_NAME } from "@/lib/auth-config";
import { buildLoginUrl, resolvePublicOrigin } from "@/lib/login-redirect";

/**
 * Fast page-level redirect. This only checks that a session cookie exists;
 * the `(app)` layout makes the authoritative API validation on every request.
 * `/api/auth/*` is excluded so login/logout can reach the proxy unauthenticated.
 *
 * The target origin comes from the forwarding headers rather than
 * `request.nextUrl`, whose host is the server's bind address (`localhost:3000`)
 * when `next start` is given `-H`.
 */
export function proxy(request: NextRequest) {
  if (!AUTH_REQUIRED) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();
  if (request.cookies.has(SESSION_COOKIE_NAME)) return NextResponse.next();

  const origin = resolvePublicOrigin(
    request.headers.get("x-forwarded-proto"),
    request.headers.get("x-forwarded-host"),
    request.headers.get("host"),
    request.nextUrl.origin,
  );
  return NextResponse.redirect(buildLoginUrl(origin, pathname, search));
}

export const config = {
  // Pages only. API routes enforce their own session/CSRF checks, and static
  // assets must stay public for the login page to render.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
