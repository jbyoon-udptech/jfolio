import { describe, expect, it } from "vitest";
import { toPortfolioTrendSeries } from "@/lib/dashboard";
import type { HistoryPoint } from "@/lib/types";

const points: HistoryPoint[] = [
  {
    asOf: "2026-10-26T00:00:00.000Z",
    totalAssetValue: 1000,
    dataStatus: "NORMAL",
  },
  {
    asOf: "2026-10-27T00:00:00.000Z",
    totalAssetValue: null,
    dataStatus: "UNAVAILABLE",
  },
];

describe("toPortfolioTrendSeries", () => {
  it("maps each API portfolio series to a chart-ready series", () => {
    expect(
      toPortfolioTrendSeries([
        { portfolioId: "pf_first", name: "First", items: points },
        { portfolioId: "pf_second", name: "Second", items: [] },
      ]),
    ).toEqual([
      { id: "pf_first", label: "First", points },
      { id: "pf_second", label: "Second", points: [] },
    ]);
  });

  it("keeps null points so the chart can break the line at gaps", () => {
    const [series] = toPortfolioTrendSeries([
      { portfolioId: "pf_first", name: "First", items: points },
    ]);
    expect(series?.points[1]?.totalAssetValue).toBeNull();
  });

  it("returns an empty list when the aggregate response has no series", () => {
    expect(toPortfolioTrendSeries(undefined)).toEqual([]);
  });
});
