import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { LoginForm } from "@/components/LoginForm";
import { authApi } from "@/lib/api";
import { SESSION_COOKIE_NAME } from "@/lib/auth-config";

export const dynamic = "force-dynamic";

/** Only allow same-origin, non-login destinations after a successful login. */
function safeNext(value: string | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (value === "/login" || value.startsWith("/login?")) return "/";
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  // If a valid session already exists, skip the login form. An API outage is
  // treated as "not signed in" rather than a hard crash. Avoid calling the API
  // for first-time visitors so no anonymous session is created.
  const hasSession = Boolean(cookies().get(SESSION_COOKIE_NAME)?.value);
  const me = hasSession ? await authApi.me().catch(() => null) : null;
  if (me?.authenticated) redirect("/");

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true">
            jF
          </span>
          <span className="brand-text">
            <span className="brand-name">jFolio</span>
            <span className="brand-sub">통합 자산 관리</span>
          </span>
        </div>
        <h1 className="login-title">로그인</h1>
        <p className="login-sub">계정으로 로그인하여 포트폴리오를 관리하세요.</p>
        <LoginForm nextPath={safeNext(searchParams.next)} />
        <p className="login-help">
          계정은 관리자가 발급합니다. 비밀번호 재설정과 회원가입은 지원하지 않습니다.
        </p>
      </section>
    </main>
  );
}
