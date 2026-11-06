import { describe, expect, it } from "vitest";
import {
  TOTAL_TREND_SERIES_LABEL,
  toPortfolioTrendSeries,
  withTotalTrendSeries,
} from "@/lib/dashboard";
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

describe("withTotalTrendSeries", () => {
  const total: HistoryPoint[] = [
    {
      asOf: "2026-10-26T00:00:00.000Z",
      totalAssetValue: 1500,
      dataStatus: "NORMAL",
    },
    {
      asOf: "2026-10-27T00:00:00.000Z",
      totalAssetValue: null,
      dataStatus: "UNAVAILABLE",
    },
  ];

  it("appends the aggregate history as the last, highlighted series", () => {
    const result = withTotalTrendSeries(
      [{ portfolioId: "pf_first", name: "First", items: points }],
      total,
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "pf_first", label: "First" });
    expect(result[1]).toMatchObject({
      label: TOTAL_TREND_SERIES_LABEL,
      total: true,
    });
    expect(result[1]?.points).toEqual(total);
  });

  it("keeps null aggregate points so the total line breaks at gaps", () => {
    const [totalSeries] = withTotalTrendSeries([], total);
    expect(totalSeries?.points[1]?.totalAssetValue).toBeNull();
  });

  it("leaves the per-portfolio series and their order untouched", () => {
    const portfolioSeries = [
      { portfolioId: "pf_first", name: "First", items: points },
      { portfolioId: "pf_second", name: "Second", items: [] },
    ];

    expect(withTotalTrendSeries(portfolioSeries, total).slice(0, 2)).toEqual(
      toPortfolioTrendSeries(portfolioSeries),
    );
  });

  it("omits the total series when the aggregate history is empty", () => {
    expect(withTotalTrendSeries(undefined, [])).toEqual([]);

    const portfolioSeries = [
      { portfolioId: "pf_first", name: "First", items: points },
    ];
    expect(withTotalTrendSeries(portfolioSeries, undefined)).toEqual(
      toPortfolioTrendSeries(portfolioSeries),
    );
  });
});
