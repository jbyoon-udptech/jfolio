import { describe, expect, it } from "vitest";
import {
  findChartExtremeAnnotations,
  findSeriesChartExtremes,
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
