import { describe, expect, it } from "vitest";
import {
  TOTAL_TREND_SERIES_LABEL,
  toPortfolioTrendSeries,
  toggleSeriesVisibility,
  visibleTrendSeries,
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

describe("visibleTrendSeries", () => {
  const series = [
    { id: "pf_first", label: "First", points },
    { id: "pf_second", label: "Second", points: [] },
  ];

  it("returns every series when nothing is hidden", () => {
    expect(visibleTrendSeries(series, new Set())).toEqual(series);
  });

  it("drops only the hidden ids and keeps the original order", () => {
    expect(visibleTrendSeries(series, new Set(["pf_first"]))).toEqual([
      series[1],
    ]);
  });

  it("can hide the aggregate series like any other", () => {
    const withTotal = withTotalTrendSeries(
      [{ portfolioId: "pf_first", name: "First", items: points }],
      points,
    );
    const total = withTotal.find((item) => item.total);
    expect(total).toBeDefined();
    expect(
      visibleTrendSeries(withTotal, new Set([total?.id ?? ""])).some(
        (item) => item.total,
      ),
    ).toBe(false);
  });

  it("returns an empty list when every series is hidden", () => {
    const hidden = new Set(["pf_first", "pf_second"]);
    expect(visibleTrendSeries(series, hidden)).toEqual([]);
  });
});

describe("toggleSeriesVisibility", () => {
  it("adds an id that is currently visible", () => {
    expect([...toggleSeriesVisibility(new Set(), "pf_first")]).toEqual([
      "pf_first",
    ]);
  });

  it("removes an id that is currently hidden", () => {
    const next = toggleSeriesVisibility(new Set(["pf_first"]), "pf_first");
    expect([...next]).toEqual([]);
  });

  it("toggles only the requested id and leaves the input set untouched", () => {
    const hidden = new Set(["pf_first"]);
    const next = toggleSeriesVisibility(hidden, "pf_second");

    expect([...next].sort()).toEqual(["pf_first", "pf_second"]);
    expect([...hidden]).toEqual(["pf_first"]);
    expect(next).not.toBe(hidden);
  });
});
