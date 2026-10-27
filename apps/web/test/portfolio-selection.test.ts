import { describe, expect, it } from "vitest";
import { ALL_PORTFOLIOS_ID } from "@jfolio/shared";
import {
  PORTFOLIO_COOKIE,
  isConcretePortfolioId,
  parsePortfolioId,
  resolvePortfolioSelection,
} from "@/lib/portfolio-selection";

const KNOWN_IDS = ["pf_main", "pf_side"];

describe("portfolio selection cookie", () => {
  it("uses a stable cookie name", () => {
    expect(PORTFOLIO_COOKIE).toBe("jfolio_portfolio");
  });

  it("normalizes blank values", () => {
    expect(parsePortfolioId("  pf_main  ")).toBe("pf_main");
    expect(parsePortfolioId("")).toBeUndefined();
    expect(parsePortfolioId("   ")).toBeUndefined();
    expect(parsePortfolioId(undefined)).toBeUndefined();
  });

  it("only treats concrete portfolio IDs as persistable", () => {
    expect(isConcretePortfolioId("pf_main")).toBe(true);
    expect(isConcretePortfolioId(ALL_PORTFOLIOS_ID)).toBe(false);
    expect(isConcretePortfolioId("")).toBe(false);
    expect(isConcretePortfolioId(undefined)).toBe(false);
  });
});

describe("resolvePortfolioSelection", () => {
  it("prefers a concrete URL portfolio over the cookie", () => {
    expect(
      resolvePortfolioSelection({
        searchValue: "pf_side",
        cookieValue: "pf_main",
        knownIds: KNOWN_IDS,
      }),
    ).toEqual({
      portfolioId: "pf_side",
      isAll: false,
      invalidExplicit: false,
      invalidCookie: false,
    });
  });

  it("uses the cookie when the URL has no portfolio", () => {
    expect(
      resolvePortfolioSelection({
        cookieValue: "pf_main",
        knownIds: KNOWN_IDS,
      }),
    ).toEqual({
      portfolioId: "pf_main",
      isAll: false,
      invalidExplicit: false,
      invalidCookie: false,
    });
  });

  it("treats an explicit all selection as the aggregate view when allowed", () => {
    expect(
      resolvePortfolioSelection({
        searchValue: ALL_PORTFOLIOS_ID,
        cookieValue: "pf_main",
        knownIds: KNOWN_IDS,
        allowAll: true,
      }),
    ).toEqual({
      isAll: true,
      invalidExplicit: false,
      invalidCookie: false,
    });
  });

  it("rejects all on pages that only support a concrete portfolio", () => {
    expect(
      resolvePortfolioSelection({
        searchValue: ALL_PORTFOLIOS_ID,
        knownIds: KNOWN_IDS,
      }),
    ).toEqual({
      isAll: false,
      invalidExplicit: true,
      invalidCookie: false,
    });
  });

  it("flags a hidden or unknown URL portfolio", () => {
    expect(
      resolvePortfolioSelection({
        searchValue: "pf_hidden",
        cookieValue: "pf_main",
        knownIds: KNOWN_IDS,
      }),
    ).toEqual({
      isAll: false,
      invalidExplicit: true,
      invalidCookie: false,
    });
  });

  it("ignores a stale cookie and lets the API use the default", () => {
    expect(
      resolvePortfolioSelection({
        cookieValue: "pf_hidden",
        knownIds: KNOWN_IDS,
      }),
    ).toEqual({
      isAll: false,
      invalidExplicit: false,
      invalidCookie: true,
    });
  });

  it("ignores an all cookie because only concrete portfolios are persisted", () => {
    expect(
      resolvePortfolioSelection({
        cookieValue: ALL_PORTFOLIOS_ID,
        knownIds: KNOWN_IDS,
      }),
    ).toEqual({
      isAll: false,
      invalidExplicit: false,
      invalidCookie: true,
    });
  });

  it("passes IDs through when the portfolio list is unavailable", () => {
    expect(
      resolvePortfolioSelection({
        searchValue: "pf_unknown",
      }),
    ).toMatchObject({ portfolioId: "pf_unknown", invalidExplicit: false });

    expect(
      resolvePortfolioSelection({
        cookieValue: "pf_unknown",
      }),
    ).toMatchObject({ portfolioId: "pf_unknown", invalidCookie: false });
  });

  it("returns no selection when neither source is set", () => {
    expect(resolvePortfolioSelection({ knownIds: KNOWN_IDS })).toEqual({
      isAll: false,
      invalidExplicit: false,
      invalidCookie: false,
    });
  });
});
