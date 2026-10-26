"use client";

import { usePathname, useRouter } from "next/navigation";
import type { Option } from "@/components/TransactionForm";

/**
 * FR-030: switch the portfolio shown on the dashboard / holdings pages by
 * updating the `portfolioId` query parameter while preserving any extras.
 */
export function PortfolioSelect({
  portfolios,
  currentId,
  extraQuery,
  allOptionLabel,
  allOptionValue = "",
}: {
  portfolios: Option[];
  currentId: string;
  /** Already-encoded query string (no leading `?`) to keep, e.g. "period=1M". */
  extraQuery?: string;
  /** When set, adds an option at the top of the list. */
  allOptionLabel?: string;
  /** Query value used by the all option; empty clears the portfolio filter. */
  allOptionValue?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    const parts: string[] = [];
    if (extraQuery) parts.push(extraQuery);
    if (value) parts.push(`portfolioId=${encodeURIComponent(value)}`);
    const qs = parts.join("&");
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="muted" style={{ fontSize: 12 }}>
        포트폴리오
      </span>
      <select value={currentId} onChange={onChange}>
        {allOptionLabel !== undefined ? (
          <option value={allOptionValue}>{allOptionLabel}</option>
        ) : null}
        {portfolios.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
