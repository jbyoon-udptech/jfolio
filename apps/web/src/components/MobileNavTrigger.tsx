"use client";

import { MOBILE_NAV_OPEN_EVENT } from "@/lib/mobile-nav";

/** Hamburger shown in the mobile page header. */
export function MobileNavTrigger() {
  return (
    <button
      type="button"
      className="mobile-nav-toggle"
      onClick={() => window.dispatchEvent(new Event(MOBILE_NAV_OPEN_EVENT))}
      aria-label="메뉴 열기"
      aria-controls="app-sidebar"
      title="메뉴 열기"
    >
      <svg
        viewBox="0 0 24 24"
        width={20}
        height={20}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <line x1="4" y1="7" x2="20" y2="7" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="17" x2="20" y2="17" />
      </svg>
    </button>
  );
}
