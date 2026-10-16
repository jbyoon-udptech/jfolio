/**
 * Sidebar navigation model. Kept as plain data plus a pure active-route helper
 * so it can be unit tested without a DOM and reused by the client `Nav`.
 */

export type NavIconName =
  | "dashboard"
  | "portfolio"
  | "history"
  | "assets"
  | "transactions"
  | "portfolios"
  | "signals"
  | "market";

export interface NavLink {
  href: string;
  label: string;
  icon: NavIconName;
}

export const NAV_LINKS: NavLink[] = [
  { href: "/", label: "대시보드", icon: "dashboard" },
  { href: "/portfolio", label: "보유 자산", icon: "portfolio" },
  { href: "/history", label: "과거 자산", icon: "history" },
  { href: "/assets", label: "자산 목록", icon: "assets" },
  { href: "/transactions", label: "거래 내역", icon: "transactions" },
  { href: "/portfolios", label: "포트폴리오", icon: "portfolios" },
  { href: "/signals", label: "시그널", icon: "signals" },
  { href: "/market-data", label: "시장 데이터", icon: "market" },
];

/**
 * Whether `href` is the active route for `pathname`. Matches exactly or as a
 * path prefix (so `/assets/[id]` keeps "자산 목록" active) while avoiding the
 * `/portfolio` vs `/portfolios` overlap a naive `startsWith` would cause.
 */
export function isNavActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
