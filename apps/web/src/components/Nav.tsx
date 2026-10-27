"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "@/components/NavIcon";
import { NAV_LINKS, isNavActive } from "@/lib/nav";

/**
 * Sidebar link list. When `collapsed`, the label is hidden and only the icon is
 * shown; a tooltip / accessible name keeps the destination discoverable.
 */
export function Nav({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  /** Called after a destination is selected, e.g. to close the mobile drawer. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <>
      {NAV_LINKS.map((link) => {
        const active = isNavActive(link.href, pathname);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={active ? "active" : undefined}
            title={collapsed ? link.label : undefined}
            aria-label={collapsed ? link.label : undefined}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
          >
            <NavIcon name={link.icon} />
            <span className="nav-label">{link.label}</span>
          </Link>
        );
      })}
    </>
  );
}
