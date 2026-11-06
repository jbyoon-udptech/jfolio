import { describe, expect, it } from "vitest";
import {
  buildDailyPricePoints,
  buildDailyTotalPoints,
  collectDailyCloses,
} from "../src/domain/asset-price-history";

const DAY_MS = 86_400_000;

describe("asset daily price history", () => {
  it("keeps the newest observation per UTC day", () => {
    const day = new Date("2026-10-11T00:00:00.000Z").getTime();
    const closes = collectDailyCloses([
      { timestamp: new Date("2026-10-11T01:00:00.000Z"), price: 100 },
      { timestamp: new Date("2026-10-11T12:00:00.000Z"), price: 105 },
      { timestamp: new Date("2026-10-12T01:00:00.000Z"), price: 110 },
    ]);

    expect(closes.get(day)).toBe(105);
    expect(closes.get(day + DAY_MS)).toBe(110);
  });

  it("compares each close with the previous available close, skipping gaps", () => {
    const firstDay = new Date("2026-10-10T00:00:00.000Z").getTime();
    const closes = new Map([
      [firstDay, 100],
      [firstDay + 2 * DAY_MS, 99],
    ]);

    const points = buildDailyPricePoints(closes, [
      new Date(firstDay + 2 * DAY_MS),
      new Date(firstDay + DAY_MS),
      new Date(firstDay),
    ]);

    // 10/12: previous available close is 10/10, not the blank 10/11 row.
    expect(points[0]).toMatchObject({ price: 99 });
    expect(points[0]?.change).toBe(-1);
    expect(points[0]?.changeRate).toBeCloseTo(-1, 4);
    // 10/11 has no close at all.
    expect(points[1]).toMatchObject({ price: null, change: null, changeRate: null });
    // 10/10 is the first close in the window, so there is no baseline.
    expect(points[2]).toMatchObject({ price: 100, change: null, changeRate: null });
  });

  it("never divides by a non-positive previous close", () => {
    const firstDay = new Date("2026-10-10T00:00:00.000Z").getTime();
    const closes = new Map([
      [firstDay, 0],
      [firstDay + DAY_MS, 10],
    ]);

    const points = buildDailyPricePoints(closes, [new Date(firstDay + DAY_MS)]);

    expect(points[0]).toMatchObject({ price: 10, change: null, changeRate: null });
  });
});

describe("asset daily total history", () => {
  it("aligns totals with quote days and skips missing baselines", () => {
    const firstDay = new Date("2026-10-10T00:00:00.000Z").getTime();
    const totals = [
      { timestamp: new Date(firstDay), totalAssetValue: 1000 },
      { timestamp: new Date(firstDay + DAY_MS), totalAssetValue: 1100 },
      // 10/12 is unavailable; 10/13 must compare with 10/11, not a zero.
      { timestamp: new Date(firstDay + 2 * DAY_MS), totalAssetValue: null },
      { timestamp: new Date(firstDay + 3 * DAY_MS), totalAssetValue: 1210 },
    ];

    const points = buildDailyTotalPoints(totals, [
      new Date(firstDay + 3 * DAY_MS),
      new Date(firstDay + 2 * DAY_MS),
      new Date(firstDay + DAY_MS),
      new Date(firstDay),
    ]);

    expect(points[0]).toMatchObject({ totalAssetValue: 1210 });
    expect(points[0]?.changeRate).toBeCloseTo(10, 4);
    expect(points[1]).toMatchObject({ totalAssetValue: null, changeRate: null });
    expect(points[2]).toMatchObject({ totalAssetValue: 1100 });
    expect(points[2]?.changeRate).toBeCloseTo(10, 4);
    expect(points[3]).toMatchObject({ totalAssetValue: 1000, changeRate: null });
  });

  it("never divides by a non-positive previous total", () => {
    const firstDay = new Date("2026-10-10T00:00:00.000Z").getTime();
    const totals = [
      { timestamp: new Date(firstDay), totalAssetValue: 0 },
      { timestamp: new Date(firstDay + DAY_MS), totalAssetValue: 500 },
    ];

    const points = buildDailyTotalPoints(totals, [new Date(firstDay + DAY_MS)]);

    expect(points[0]).toMatchObject({ totalAssetValue: 500, changeRate: null });
  });
});
