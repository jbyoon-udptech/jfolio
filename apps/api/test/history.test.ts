import { describe, expect, it } from "vitest";
import { msUntilNext, startOfDayInTimeZone, startOfHour } from "../src/scheduler/time";
import { createInstrument, createPortfolio, createTestContext, makeQuote } from "./helpers";
import type { Instrument } from "@jfolio/shared";

const DAY = 24 * 60 * 60 * 1000;
const iso = (value: string) => new Date(value);

/** Persist a daily-close quote so `getQuoteAsOf` can resolve it for past instants. */
async function storeDaily(
  container: ReturnType<typeof createTestContext>["container"],
  instrument: Instrument,
  price: number,
  timestamp: Date,
) {
  await container.marketData.storeQuote(
    instrument,
    makeQuote(instrument, price, { timestamp, interval: "1d" }),
  );
}

describe("14.3 historical data", () => {
  it("H-001: only transactions dated at or before the as-of time are reflected", async () => {
    const { container } = createTestContext();
    const portfolio = await createPortfolio(container);
    const instrument = await createInstrument(container, {
      symbol: "AAA",
      name: "Asset A",
      assetType: "STOCK",
      market: "KRX",
      currency: "KRW",
      providers: [],
    });

    const day1 = iso("2026-10-11T00:00:00.000Z");
    const day2 = iso("2026-10-12T00:00:00.000Z");
    const day3 = iso("2026-10-13T00:00:00.000Z");
    const day4 = iso("2026-10-14T00:00:00.000Z");

    await container.transactions.create({
      portfolioId: portfolio.portfolioId,
      instrumentId: instrument.instrumentId,
      type: "BUY",
      timestamp: day1,
      quantity: 10,
      price: 100,
      currency: "KRW",
      fee: 0,
    });
    await container.transactions.create({
      portfolioId: portfolio.portfolioId,
      instrumentId: instrument.instrumentId,
      type: "BUY",
      timestamp: day3,
      quantity: 10,
      price: 200,
      currency: "KRW",
      fee: 0,
    });
    await storeDaily(container, instrument, 100, day1);
    await storeDaily(container, instrument, 100, day3);

    const atDay2 = await container.valuation.valuate(portfolio.portfolioId, { asOf: day2 });
    expect(atDay2.positions[0]?.quantity).toBe(10);
    expect(atDay2.positions[0]?.costBasisBase).toBe(1000);

    const atDay4 = await container.valuation.valuate(portfolio.portfolioId, { asOf: day4 });
    expect(atDay4.positions[0]?.quantity).toBe(20);
    expect(atDay4.positions[0]?.costBasisBase).toBe(3000);
  });

  it("H-002: a historical valuation uses the FX rate in effect at that instant", async () => {
    const { container } = createTestContext();
    const portfolio = await createPortfolio(container, "KRW");
    const fx = await createInstrument(container, {
      symbol: "USD/KRW",
      name: "US Dollar / Korean Won",
      assetType: "FX",
      market: "FX",
      currency: "KRW",
      providers: [{ providerId: "test", providerSymbol: "USD" }],
    });
    const usd = await createInstrument(container, {
      symbol: "AAPL",
      name: "Apple Inc.",
      assetType: "STOCK",
      market: "NASDAQ",
      currency: "USD",
      providers: [],
    });

    const day1 = iso("2026-10-11T00:00:00.000Z");
    const day2 = iso("2026-10-12T00:00:00.000Z");
    const day3 = iso("2026-10-13T00:00:00.000Z");
    const day4 = iso("2026-10-14T00:00:00.000Z");

    await container.transactions.create({
      portfolioId: portfolio.portfolioId,
      instrumentId: usd.instrumentId,
      type: "BUY",
      timestamp: day1,
      quantity: 1,
      price: 100,
      currency: "USD",
      fee: 0,
    });
    // The FX rate moves over time: 1,400 then 1,300.
    await storeDaily(container, fx, 1400, day1);
    await storeDaily(container, fx, 1300, day3);
    await storeDaily(container, usd, 100, day1);
    await storeDaily(container, usd, 100, day3);

    const atDay2 = await container.valuation.valuate(portfolio.portfolioId, { asOf: day2 });
    expect(atDay2.positions[0]?.fxRateToBase).toBe(1400);
    expect(atDay2.positions[0]?.marketValueBase).toBe(140000);
    expect(atDay2.totalAssetValue).toBe(140000);

    const atDay4 = await container.valuation.valuate(portfolio.portfolioId, { asOf: day4 });
    expect(atDay4.positions[0]?.fxRateToBase).toBe(1300);
    expect(atDay4.positions[0]?.marketValueBase).toBe(130000);
    expect(atDay4.totalAssetValue).toBe(130000);
  });

  it("H-003: a snapshot equals a fresh recomputation at the same instant and is idempotent", async () => {
    const { container } = createTestContext();
    const portfolio = await createPortfolio(container, "KRW");
    const instrument = await createInstrument(container, {
      symbol: "AAA",
      name: "Asset A",
      assetType: "STOCK",
      market: "KRX",
      currency: "KRW",
      providers: [],
    });
    const day1 = iso("2026-10-11T00:00:00.000Z");
    const day2 = iso("2026-10-12T00:00:00.000Z");

    await container.transactions.create({
      portfolioId: portfolio.portfolioId,
      instrumentId: instrument.instrumentId,
      type: "BUY",
      timestamp: day1,
      quantity: 10,
      price: 80,
      currency: "KRW",
      fee: 0,
    });
    await storeDaily(container, instrument, 100, day1);

    const snapshot = await container.snapshots.createSnapshot({
      portfolioId: portfolio.portfolioId,
      snapshotType: "DAILY",
      asOf: day2,
    });
    const recomputed = await container.valuation.valuate(portfolio.portfolioId, { asOf: day2 });

    expect(snapshot.totalAssetValue).toBe(recomputed.totalAssetValue);
    expect(snapshot.unrealizedPnL).toBe(recomputed.unrealizedPnL);
    expect(snapshot.totalAssetValue).toBe(1000);

    // Re-running for the same portfolio + type + asOf updates in place.
    const again = await container.snapshots.createSnapshot({
      portfolioId: portfolio.portfolioId,
      snapshotType: "DAILY",
      asOf: day2,
    });
    expect(again.snapshotId).toBe(snapshot.snapshotId);
    const stored = await container.snapshots.list(portfolio.portfolioId);
    expect(stored).toHaveLength(1);
  });

  it("H-004: a period with no quote yields UNAVAILABLE rather than a wrong (zero) value", async () => {
    const { container } = createTestContext();
    const portfolio = await createPortfolio(container, "KRW");
    const priced = await createInstrument(container, {
      symbol: "AAA",
      name: "Asset A",
      assetType: "STOCK",
      market: "KRX",
      currency: "KRW",
      providers: [],
    });
    const unpriced = await createInstrument(container, {
      symbol: "BBB",
      name: "Asset B",
      assetType: "STOCK",
      market: "KRX",
      currency: "KRW",
      providers: [],
    });
    const day1 = iso("2026-10-11T00:00:00.000Z");
    const day2 = iso("2026-10-12T00:00:00.000Z");

    for (const instrument of [priced, unpriced]) {
      await container.transactions.create({
        portfolioId: portfolio.portfolioId,
        instrumentId: instrument.instrumentId,
        type: "BUY",
        timestamp: day1,
        quantity: 10,
        price: 100,
        currency: "KRW",
        fee: 0,
      });
    }
    // Only the first instrument ever receives a quote.
    await storeDaily(container, priced, 100, day1);

    const valuation = await container.valuation.valuate(portfolio.portfolioId, { asOf: day2 });
    const missing = valuation.positions.find((p) => p.instrumentId === unpriced.instrumentId);
    expect(missing?.status).toBe("UNAVAILABLE");
    expect(missing?.statusReason).toBe("NO_PRICE");
    expect(missing?.marketValueBase).toBeNull();

    // The unpriced position must not be counted as zero.
    expect(valuation.unavailableCount).toBe(1);
    expect(valuation.totalAssetValue).toBe(1000);
    expect(valuation.dataStatus).toBe("UNAVAILABLE");
  });

  it("H-004b: with no quote at all the portfolio reports NO_PRICE, never a zero valuation", async () => {
    const { container } = createTestContext();
    const portfolio = await createPortfolio(container, "KRW");
    const instrument = await createInstrument(container, {
      symbol: "AAA",
      name: "Asset A",
      assetType: "STOCK",
      market: "KRX",
      currency: "KRW",
      providers: [],
    });
    await container.transactions.create({
      portfolioId: portfolio.portfolioId,
      instrumentId: instrument.instrumentId,
      type: "BUY",
      timestamp: iso("2026-10-11T00:00:00.000Z"),
      quantity: 10,
      price: 100,
      currency: "KRW",
      fee: 0,
    });

    const valuation = await container.valuation.valuate(portfolio.portfolioId, {
      asOf: iso("2026-10-12T00:00:00.000Z"),
    });
    expect(valuation.positions[0]?.status).toBe("UNAVAILABLE");
    expect(valuation.positions[0]?.marketValue).toBeNull();
    expect(valuation.positions[0]?.marketValueBase).toBeNull();
    expect(valuation.dataStatus).toBe("UNAVAILABLE");
  });

  it("H-005: daily snapshot boundaries respect the configured timezone", () => {
    // Asia/Seoul is UTC+9 with no DST.
    expect(startOfDayInTimeZone(iso("2026-10-15T15:00:00.000Z"), "Asia/Seoul").toISOString()).toBe(
      "2026-10-15T15:00:00.000Z",
    );
    expect(startOfDayInTimeZone(iso("2026-10-15T14:59:59.000Z"), "Asia/Seoul").toISOString()).toBe(
      "2026-10-14T15:00:00.000Z",
    );
    // UTC midnight is the boundary in UTC.
    expect(startOfDayInTimeZone(iso("2026-10-15T23:59:59.000Z"), "UTC").toISOString()).toBe(
      "2026-10-15T00:00:00.000Z",
    );
  });

  it("H-005b: hourly boundaries and scheduling delays are computed correctly", () => {
    expect(startOfHour(iso("2026-10-16T12:34:56.789Z")).toISOString()).toBe(
      "2026-10-16T12:00:00.000Z",
    );
    // 12:34:56 is 25m04s from the 13:00 boundary.
    expect(msUntilNext(startOfHour, iso("2026-10-16T12:34:56.000Z"), 3_600_000)).toBe(
      25 * 60_000 + 4_000,
    );
    expect(msUntilNext(startOfHour, iso("2026-10-16T12:00:00.000Z"), 3_600_000)).toBe(3_600_000);
  });

  it("H-006: historySeries reconstructs a past series and skips unavailable points", async () => {
    const { container } = createTestContext();
    const portfolio = await createPortfolio(container, "KRW");
    const instrument = await createInstrument(container, {
      symbol: "AAA",
      name: "Asset A",
      assetType: "STOCK",
      market: "KRX",
      currency: "KRW",
      providers: [],
    });
    const day1 = iso("2026-10-11T00:00:00.000Z");
    await container.transactions.create({
      portfolioId: portfolio.portfolioId,
      instrumentId: instrument.instrumentId,
      type: "BUY",
      timestamp: day1,
      quantity: 10,
      price: 100,
      currency: "KRW",
      fee: 0,
    });
    // A quote only exists from day 3 onward.
    await storeDaily(container, instrument, 100, iso("2026-10-13T00:00:00.000Z"));

    const series = await container.valuation.historySeries(portfolio.portfolioId, {
      from: day1,
      to: new Date(day1.getTime() + 3 * DAY),
      interval: "daily",
    });
    expect(series).toHaveLength(4);
    // Before the first quote the point is unavailable (null), not zero.
    expect(series[0]?.totalAssetValue).toBeNull();
    expect(series[0]?.dataStatus).toBe("UNAVAILABLE");
    // From day 3 the quote resolves.
    expect(series[2]?.totalAssetValue).toBe(1000);
    expect(series[2]?.dataStatus).toBe("NORMAL");
  });
});
