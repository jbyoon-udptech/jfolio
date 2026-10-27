"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ALL_PORTFOLIOS_ID } from "@jfolio/shared";
import type { Option } from "@/components/TransactionForm";
import {
  PORTFOLIO_COOKIE,
  PORTFOLIO_COOKIE_MAX_AGE,
  isConcretePortfolioId,
} from "@/lib/portfolio-selection";

function persistPortfolio(value: string | undefined): void {
  if (!isConcretePortfolioId(value)) return;
  document.cookie = `${PORTFOLIO_COOKIE}=${value}; path=/; max-age=${PORTFOLIO_COOKIE_MAX_AGE}; samesite=lax`;
}

/**
 * FR-030: switch the portfolio shown on the dashboard / holdings pages by
 * updating the `portfolioId` query parameter while preserving any extras. A
 * concrete selection is also written to a cookie so the next navigation, which
 * does not carry query strings, keeps the same portfolio.
 */
export function PortfolioSelect({
  portfolios,
  currentId,
  extraQuery,
  explicitPortfolioId,
  allOptionLabel,
  allOptionValue = ALL_PORTFOLIOS_ID,
}: {
  portfolios: Option[];
  currentId: string;
  /** Already-encoded query string (no leading `?`) to keep, e.g. "period=1M". */
  extraQuery?: string;
  /** Concrete ID present in the URL; synced into the cookie on direct links. */
  explicitPortfolioId?: string;
  /** When set, adds an option at the top of the list. */
  allOptionLabel?: string;
  /** Query value used by the all option. `all` is never persisted. */
  allOptionValue?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // Deep links such as /portfolio?portfolioId=... should become the saved
  // selection, while a page simply falling back to its default should not.
  useEffect(() => {
    persistPortfolio(explicitPortfolioId);
  }, [explicitPortfolioId]);

  function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    persistPortfolio(value);
    const parts: string[] = [];
    if (extraQuery) parts.push(extraQuery);
    if (value) parts.push(`portfolioId=${encodeURIComponent(value)}`);
    const qs = parts.join("&");
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <label className="portfolio-select">
      <select aria-label="포트폴리오" value={currentId} onChange={onChange}>
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
