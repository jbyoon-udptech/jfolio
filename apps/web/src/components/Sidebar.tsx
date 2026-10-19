"use client";

import Link from "next/link";
import { useState } from "react";
import type { AuthUser } from "@jfolio/shared";
import { Nav } from "@/components/Nav";
import { apiFetch } from "@/lib/client-fetch";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Left navigation with a collapse toggle. Collapsing keeps the menu visible as a
 * compact icon rail instead of hiding it. The state is stored in a cookie so the
 * server renders the same layout on the next load (no flash / hydration drift).
 */
export function Sidebar({
  defaultCollapsed = false,
  user = null,
}: {
  defaultCollapsed?: boolean;
  /** Signed-in user shown at the bottom of the sidebar. */
  user?: AuthUser | null;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  async function logout() {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      const res = await apiFetch("/api/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(payload?.error?.message ?? `로그아웃 실패 (${res.status})`);
      }
      window.location.assign("/login");
    } catch (err) {
      setLogoutError(err instanceof Error ? err.message : "로그아웃 실패");
      setLoggingOut(false);
    }
  }

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      const value = next ? "collapsed" : "expanded";
      document.cookie = `${SIDEBAR_COOKIE}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
      return next;
    });
  }

  const toggleLabel = collapsed ? "사이드바 펼치기" : "사이드바 접기";

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="sidebar-head">
        <Link href="/" className="brand" aria-label="jFolio 홈">
          <span className="brand-mark" aria-hidden="true">
            jF
          </span>
          <span className="brand-text">
            <span className="brand-name">jFolio</span>
            <span className="brand-sub">통합 자산 관리</span>
          </span>
        </Link>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="sidebar-nav"
          aria-label={toggleLabel}
          title={toggleLabel}
        >
          <svg
            viewBox="0 0 24 24"
            width={18}
            height={18}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="m15 6-6 6 6 6" />
          </svg>
        </button>
      </div>
      <nav id="sidebar-nav" className="nav">
        <Nav collapsed={collapsed} />
      </nav>
      {user ? (
        <div className="sidebar-user">
          <span className="sidebar-user-avatar" aria-hidden="true">
            {userInitial(user)}
          </span>
          <span className="sidebar-user-text">
            <span className="sidebar-user-name">{user.name}</span>
            <span className="sidebar-user-email" title={user.email}>
              {user.email}
            </span>
          </span>
          <button
            type="button"
            className="sidebar-logout"
            onClick={logout}
            disabled={loggingOut}
            aria-label="로그아웃"
            title={logoutError ?? "로그아웃"}
          >
            <svg
              viewBox="0 0 24 24"
              width={17}
              height={17}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
          {logoutError ? (
            <span className="sidebar-user-error" role="alert">
              {logoutError}
            </span>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

function userInitial(user: AuthUser): string {
  const source = user.name.trim() || user.email;
  return source.slice(0, 1).toUpperCase();
}
