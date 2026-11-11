import { describe, expect, it } from "vitest";
import {
  findChartExtremeAnnotations,
  findSeriesChartExtremes,
  findTrendChartExtremes,
  findValueChartExtremeAnnotations,
} from "@/lib/chart-annotations";
import type { ChartPoint } from "@/lib/chart-annotations";

const points: ChartPoint[] = [
  { asOf: "2026-10-01T00:00:00.000Z", totalAssetValue: 700 },
  { asOf: "2026-10-03T00:00:00.000Z", totalAssetValue: 1000 },
  { asOf: "2026-10-15T00:00:00.000Z", totalAssetValue: 500 },
  { asOf: "2026-10-20T00:00:00.000Z", totalAssetValue: 800 },
];

describe("chart extreme annotations", () => {
  it("measures the max and min against the latest finite value", () => {
    const [max, min] = findChartExtremeAnnotations(points);
    expect(max).toEqual({
      kind: "max",
      index: 1,
      asOf: "2026-10-03T00:00:00.000Z",
      value: 1000,
      changeRate: -20,
    });
    expect(min).toEqual({
      kind: "min",
      index: 2,
      asOf: "2026-10-15T00:00:00.000Z",
      value: 500,
      changeRate: 60,
    });
  });

  it("annotates generic value points such as price series", () => {
    const [max, min] = findValueChartExtremeAnnotations([
      { asOf: "2026-10-01T00:00:00.000Z", value: 100 },
      { asOf: "2026-10-03T00:00:00.000Z", value: 150 },
      { asOf: "2026-10-15T00:00:00.000Z", value: 90 },
      { asOf: "2026-10-20T00:00:00.000Z", value: 120 },
    ]);

    expect(max).toMatchObject({ kind: "max", index: 1, value: 150, changeRate: -20 });
    expect(min).toMatchObject({ kind: "min", index: 2, value: 90 });
    expect(min?.changeRate).toBeCloseTo(100 / 3);
  });

  it("skips unavailable points and uses the last finite point as current", () => {
    const [max, min] = findChartExtremeAnnotations([
      { asOf: "2026-10-01T00:00:00.000Z", totalAssetValue: null },
      ...points,
      { asOf: "2026-10-21T00:00:00.000Z", totalAssetValue: null },
    ]);
    expect(max?.value).toBe(1000);
    expect(max?.changeRate).toBe(-20);
    expect(min?.changeRate).toBe(60);
  });

  it("does not annotate a series with fewer than two finite points", () => {
    expect(
      findChartExtremeAnnotations([
        { asOf: "2026-10-01T00:00:00.000Z", totalAssetValue: 1000 },
      ]),
    ).toEqual([]);
  });

  it("keeps each series' current value when annotating a shared chart", () => {
    const annotations = findSeriesChartExtremes([
      { points: [points[1]!, points[3]!] },
      {
        points: [
          { asOf: "2026-10-01T00:00:00.000Z", totalAssetValue: 400 },
          { asOf: "2026-10-20T00:00:00.000Z", totalAssetValue: 500 },
        ],
      },
    ]);

    expect(annotations[0]).toMatchObject({
      kind: "max",
      seriesIndex: 0,
      value: 1000,
      changeRate: -20,
    });
    expect(annotations[1]).toMatchObject({
      kind: "min",
      seriesIndex: 1,
      value: 400,
      changeRate: 25,
    });
  });
});

describe("findTrendChartExtremes", () => {
  const portfolioPoints: ChartPoint[] = [
    { asOf: "2026-10-01T00:00:00.000Z", totalAssetValue: 100 },
    { asOf: "2026-10-02T00:00:00.000Z", totalAssetValue: 200 },
    { asOf: "2026-10-03T00:00:00.000Z", totalAssetValue: 150 },
  ];
  const totalPoints: ChartPoint[] = [
    { asOf: "2026-10-01T00:00:00.000Z", totalAssetValue: 300 },
    { asOf: "2026-10-02T00:00:00.000Z", totalAssetValue: 400 },
    { asOf: "2026-10-03T00:00:00.000Z", totalAssetValue: 350 },
  ];

  it("annotates the aggregate line separately from the portfolio extremes", () => {
    const annotations = findTrendChartExtremes([
      { id: "pf_a", points: portfolioPoints },
      { id: "__total__", total: true, points: totalPoints },
    ]);

    expect(annotations.map(({ seriesId, kind }) => `${seriesId}:${kind}`)).toEqual(
      ["pf_a:max", "pf_a:min", "__total__:max", "__total__:min"],
    );
  });

  it("measures each group against its own latest finite value", () => {
    const annotations = findTrendChartExtremes([
      { id: "pf_a", points: portfolioPoints },
      { id: "__total__", total: true, points: totalPoints },
    ]);

    expect(annotations[0]).toMatchObject({ value: 200, changeRate: -25 });
    expect(annotations[1]).toMatchObject({ value: 100, changeRate: 50 });
    expect(annotations[2]).toMatchObject({ value: 400 });
    expect(annotations[2]?.changeRate).toBeCloseTo(-12.5);
    expect(annotations[3]).toMatchObject({ value: 300 });
    expect(annotations[3]?.changeRate).toBeCloseTo(100 / 6);
  });

  it("annotates the total when it is the only visible series", () => {
    const annotations = findTrendChartExtremes([
      { id: "__total__", total: true, points: totalPoints },
    ]);

    expect(annotations).toHaveLength(2);
    expect(annotations.every((item) => item.seriesId === "__total__")).toBe(true);
  });

  it("skips a group whose series have no usable shape", () => {
    expect(
      findTrendChartExtremes([
        { id: "__total__", total: true, points: [totalPoints[0]!] },
      ]),
    ).toEqual([]);
  });
});
