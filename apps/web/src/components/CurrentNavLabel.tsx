"use client";

import { usePathname } from "next/navigation";
import { findNavLink } from "@/lib/nav";

/** Current navigation label shown in the page header on every viewport. */
export function CurrentNavLabel() {
  const pathname = usePathname();
  const current = findNavLink(pathname);
  if (!current) return null;

  return <span className="page-header-title">{current.label}</span>;
}
