"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "대시보드" },
  { href: "/portfolio", label: "보유 자산" },
  { href: "/history", label: "과거 자산" },
  { href: "/assets", label: "자산 목록" },
  { href: "/transactions", label: "거래 내역" },
  { href: "/portfolios", label: "포트폴리오" },
  { href: "/signals", label: "시그널" },
  { href: "/market-data", label: "시장 데이터" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <>
      {LINKS.map((link) => {
        const active =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            style={active ? { background: "var(--panel-2)", color: "var(--accent)" } : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
