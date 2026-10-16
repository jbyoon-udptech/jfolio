"use client";

import Link from "next/link";
import { useState } from "react";
import { Nav } from "@/components/Nav";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Left navigation with a collapse toggle. Collapsing keeps the menu visible as a
 * compact icon rail instead of hiding it. The state is stored in a cookie so the
 * server renders the same layout on the next load (no flash / hydration drift).
 */
export function Sidebar({ defaultCollapsed = false }: { defaultCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

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
    </aside>
  );
}
