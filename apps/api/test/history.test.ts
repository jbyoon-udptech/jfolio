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

  it("H-007: historySeries resolves shared lookups once per request", async () => {
    const { repos, container } = createTestContext();
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
    await storeDaily(container, fx, 1400, day1);
    await storeDaily(container, fx, 1300, day3);
    await storeDaily(container, usd, 100, day1);
    await storeDaily(container, usd, 100, day3);

    // Count repository round trips made by the history request itself.
    const calls = { portfolios: 0, ledgers: 0, instruments: 0, fxSeeds: 0, fxRanges: 0 };
    const portfolioRepo = repos.portfolios;
    const findPortfolio = portfolioRepo.findById.bind(portfolioRepo);
    portfolioRepo.findById = async (id: string) => {
      calls.portfolios += 1;
      return findPortfolio(id);
    };
    const transactionRepo = repos.transactions;
    const listByPortfolio = transactionRepo.listByPortfolio.bind(transactionRepo);
    transactionRepo.listByPortfolio = async (portfolioId: string, to?: Date) => {
      calls.ledgers += 1;
      return listByPortfolio(portfolioId, to);
    };
    const instrumentRepo = repos.instruments;
    const findMany = instrumentRepo.findMany.bind(instrumentRepo);
    instrumentRepo.findMany = async (ids: string[]) => {
      calls.instruments += 1;
      return findMany(ids);
    };
    const fxRepo = repos.fxRates;
    const getRate = fxRepo.getRate.bind(fxRepo);
    fxRepo.getRate = async (base: string, quote: string, asOf: Date) => {
      calls.fxSeeds += 1;
      return getRate(base, quote, asOf);
    };
    const getRates = fxRepo.getRates.bind(fxRepo);
    fxRepo.getRates = async (
      base: string,
      quote: string,
      query?: Parameters<typeof getRates>[2],
    ) => {
      calls.fxRanges += 1;
      return getRates(base, quote, query);
    };

    const quoteCalls = { lastBefore: 0, historical: 0 };
    const quoteRepo = repos.quotes;
    const getLastBefore = quoteRepo.getLastBefore.bind(quoteRepo);
    quoteRepo.getLastBefore = async (
      instrumentId: string,
      before: Date,
      interval?: Parameters<typeof getLastBefore>[2],
    ) => {
      quoteCalls.lastBefore += 1;
      return getLastBefore(instrumentId, before, interval);
    };
    const getHistorical = quoteRepo.getHistorical.bind(quoteRepo);
    quoteRepo.getHistorical = async (
      instrumentId: string,
      query?: Parameters<typeof getHistorical>[1],
    ) => {
      quoteCalls.historical += 1;
      return getHistorical(instrumentId, query);
    };

    const series = await container.valuation.historySeries(portfolio.portfolioId, {
      from: day1,
      to: day4,
      interval: "daily",
    });

    expect(series.map((point) => point.totalAssetValue)).toEqual([
      140000, 140000, 130000, 130000,
    ]);
    expect(calls.portfolios).toBe(1);
    expect(calls.ledgers).toBe(1);
    expect(calls.instruments).toBe(1);
    // Quote history is fetched once per instrument for the whole window, not
    // once per point: one seed lookup and one range lookup.
    expect(quoteCalls.lastBefore).toBe(1);
    expect(quoteCalls.historical).toBe(1);
    // FX ranges are fetched once per directed pair (USD/KRW and KRW/USD), then
    // every point is valued from memory. The point loop issues no rate lookups.
    expect(calls.fxSeeds).toBe(2);
    expect(calls.fxRanges).toBe(2);
  });

  it("H-008: historySeries falls back to any-interval quotes when no daily close exists", async () => {
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
    const day3 = iso("2026-10-13T00:00:00.000Z");

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
    // Intraday observations only: the bulk daily read finds nothing, so the
    // per-point path must still fall back to the any-interval quote.
    for (const [price, timestamp] of [
      [100, day1],
      [110, day2],
      [120, day3],
    ] as const) {
      await container.marketData.storeQuote(
        instrument,
        makeQuote(instrument, price, { timestamp, interval: "1m" }),
      );
    }

    const series = await container.valuation.historySeries(portfolio.portfolioId, {
      from: day1,
      to: day3,
      interval: "daily",
    });

    expect(series.map((point) => point.totalAssetValue)).toEqual([1000, 1100, 1200]);
    expect(series.map((point) => point.dataStatus)).toEqual(["NORMAL", "NORMAL", "NORMAL"]);
  });

  it("H-009: historySeries uses the latest quote for a now-ish final point", async () => {
    const { container, now } = createTestContext();
    const portfolio = await createPortfolio(container, "KRW");
    const instrument = await createInstrument(container, {
      symbol: "AAA",
      name: "Asset A",
      assetType: "STOCK",
      market: "KRX",
      currency: "KRW",
      providers: [],
    });
    const from = new Date(now.getTime() - 2 * DAY);

    await container.transactions.create({
      portfolioId: portfolio.portfolioId,
      instrumentId: instrument.instrumentId,
      type: "BUY",
      timestamp: from,
      quantity: 10,
      price: 100,
      currency: "KRW",
      fee: 0,
    });
    await storeDaily(container, instrument, 100, from);
    // A fresher intraday observation must win for the "now" point, exactly as
    // a single-point valuation would.
    await container.marketData.storeQuote(
      instrument,
      makeQuote(instrument, 130, { timestamp: now, interval: "1m" }),
    );

    const series = await container.valuation.historySeries(portfolio.portfolioId, {
      from,
      to: now,
      interval: "daily",
    });

    expect(series).toHaveLength(3);
    expect(series.map((point) => point.totalAssetValue)).toEqual([1000, 1000, 1300]);
  });

  it("H-010: historySeries preserves the stablecoin FX bridge from a bulk range", async () => {
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
    const btc = await createInstrument(container, {
      symbol: "BTCUSDT",
      name: "Bitcoin",
      assetType: "CRYPTO",
      market: "BINANCE",
      currency: "USDT",
      providers: [],
    });
    const day1 = iso("2026-10-11T00:00:00.000Z");
    const day3 = iso("2026-10-13T00:00:00.000Z");

    await container.transactions.create({
      portfolioId: portfolio.portfolioId,
      instrumentId: btc.instrumentId,
      type: "BUY",
      timestamp: day1,
      quantity: 1,
      price: 100,
      currency: "USDT",
      fee: 0,
    });
    await storeDaily(container, fx, 1400, day1);
    await storeDaily(container, fx, 1300, day3);
    await storeDaily(container, btc, 100, day1);
    await storeDaily(container, btc, 110, day3);

    const series = await container.valuation.historySeries(portfolio.portfolioId, {
      from: day1,
      to: day3,
      interval: "daily",
    });

    // USDT -> USD (peg) -> KRW, using the USD/KRW rate in effect at each point.
    expect(series.map((point) => point.totalAssetValue)).toEqual([140000, 140000, 143000]);
  });
});
