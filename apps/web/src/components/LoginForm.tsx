"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client-fetch";

/** Phase 1 local login form. Google SSO is reserved for Phase 2. */
export function LoginForm({ nextPath = "/" }: { nextPath?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: String(data.get("email") ?? "").trim(),
          password: String(data.get("password") ?? ""),
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(payload?.error?.message ?? `로그인 실패 (${res.status})`);
      }
      // Full navigation so server components see the new session immediately.
      window.location.assign(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
      setPending(false);
    }
  }

  return (
    <form className="login-form" onSubmit={onSubmit}>
      <label>
        이메일
        <input
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          required
          autoFocus
          placeholder="you@example.com"
        />
      </label>
      <label>
        비밀번호
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
        />
      </label>
      <button type="submit" className="primary login-submit" disabled={pending}>
        {pending ? "로그인 중…" : "로그인"}
      </button>
      {error ? (
        <div className="notice error" role="alert">
          {error}
        </div>
      ) : null}
    </form>
  );
}
