import { NextResponse, type NextRequest } from "next/server";
import { AUTH_REQUIRED, SESSION_COOKIE_NAME } from "@/lib/auth-config";

/**
 * Fast page-level redirect. This only checks that a session cookie exists;
 * the `(app)` layout makes the authoritative API validation on every request.
 * `/api/auth/*` is excluded so login/logout can reach the proxy unauthenticated.
 */
export function middleware(request: NextRequest) {
  if (!AUTH_REQUIRED) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();
  if (request.cookies.has(SESSION_COOKIE_NAME)) return NextResponse.next();

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Pages only. API routes enforce their own session/CSRF checks, and static
  // assets must stay public for the login page to render.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
