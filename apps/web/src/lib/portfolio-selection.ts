/**
 * Selected-portfolio helpers shared by the server pages (which read the cookie)
 * and the client `PortfolioSelect` component (which writes it). The module is
 * kept free of `next/headers` so it can be imported by client components and
 * unit tests.
 */

import { ALL_PORTFOLIOS_ID } from "@jfolio/shared";

/** Cookie that persists the selected portfolio across navigation. */
export const PORTFOLIO_COOKIE = "jfolio_portfolio";

/** One year, matching the sidebar UI-state cookie. */
export const PORTFOLIO_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Normalize a raw query/cookie value; blank values mean "not set". */
export function parsePortfolioId(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Whether `value` is a concrete portfolio ID. `all` is an aggregate view, not a
 * portfolio, and is never persisted as the selected portfolio.
 */
export function isConcretePortfolioId(value: string | undefined): value is string {
  const id = parsePortfolioId(value);
  return id !== undefined && id !== ALL_PORTFOLIOS_ID;
}

export interface PortfolioSelection {
  /** Concrete portfolio ID to use, or undefined to let the API pick the default. */
  portfolioId?: string;
  /** True when the aggregate `all` view was explicitly requested. */
  isAll: boolean;
  /** True when the URL named a portfolio that is not in the visible list. */
  invalidExplicit: boolean;
  /** True when the stored cookie no longer resolves to a visible portfolio. */
  invalidCookie: boolean;
}

/**
 * Resolve the portfolio for a page. The URL wins over the cookie so deep links
 * and explicit page state are never overridden by a previous selection.
 *
 * `knownIds` may be undefined when the portfolio list could not be loaded; in
 * that case IDs are passed through and the API remains the authority.
 */
export function resolvePortfolioSelection({
  searchValue,
  cookieValue,
  knownIds,
  allowAll = false,
}: {
  searchValue?: string;
  cookieValue?: string;
  knownIds?: readonly string[];
  allowAll?: boolean;
}): PortfolioSelection {
  const search = parsePortfolioId(searchValue);
  const cookie = parsePortfolioId(cookieValue);

  if (search) {
    if (search === ALL_PORTFOLIOS_ID) {
      return {
        isAll: allowAll,
        invalidExplicit: !allowAll,
        invalidCookie: false,
      };
    }
    if (knownIds && !knownIds.includes(search)) {
      return {
        isAll: false,
        invalidExplicit: true,
        invalidCookie: false,
      };
    }
    return {
      portfolioId: search,
      isAll: false,
      invalidExplicit: false,
      invalidCookie: false,
    };
  }

  if (cookie && cookie !== ALL_PORTFOLIOS_ID) {
    if (!knownIds || knownIds.includes(cookie)) {
      return {
        portfolioId: cookie,
        isAll: false,
        invalidExplicit: false,
        invalidCookie: false,
      };
    }
    return {
      isAll: false,
      invalidExplicit: false,
      invalidCookie: true,
    };
  }

  return {
    isAll: false,
    invalidExplicit: false,
    invalidCookie: cookie !== undefined,
  };
}
