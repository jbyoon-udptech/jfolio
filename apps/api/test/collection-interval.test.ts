import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { quoteIntervalFromSeconds } from "../src/domain/intervals";
import { createInstrument, createTestContext, FIXED_NOW } from "./helpers";

describe("collection interval labels", () => {
  beforeEach(() => {
    // The mock provider reads the wall clock directly; pin it to FIXED_NOW.
    vi.useFakeTimers({ now: FIXED_NOW });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps configured seconds to canonical quote intervals", () => {
    expect(quoteIntervalFromSeconds(1)).toBe("tick");
    expect(quoteIntervalFromSeconds(10)).toBe("10s");
    expect(quoteIntervalFromSeconds(60)).toBe("1m");
    expect(quoteIntervalFromSeconds(300)).toBe("5m");
    expect(quoteIntervalFromSeconds(600)).toBe("10m");
    expect(quoteIntervalFromSeconds(3600)).toBe("1h");
    expect(quoteIntervalFromSeconds(86400)).toBe("1d");
    expect(quoteIntervalFromSeconds(90)).toBe("90s");
    expect(quoteIntervalFromSeconds(120)).toBe("2m");
    expect(quoteIntervalFromSeconds(172800)).toBe("2d");
    expect(() => quoteIntervalFromSeconds(0)).toThrow(RangeError);
  });

  it("stores the configured collection cadence on new quotes", async () => {
    const { container } = createTestContext(FIXED_NOW, {
      STOCK_COLLECTION_INTERVAL_SECONDS: "300",
      CRYPTO_COLLECTION_INTERVAL_SECONDS: "600",
      FX_COLLECTION_INTERVAL_SECONDS: "90",
    });
    const stock = await createInstrument(container, {
      symbol: "AAA",
      name: "Stock A",
      assetType: "STOCK",
      market: "KRX",
      currency: "KRW",
      providers: [],
    });
    const etf = await createInstrument(container, {
      symbol: "BBB",
      name: "ETF B",
      assetType: "ETF",
      market: "KRX",
      currency: "KRW",
      providers: [],
    });
    const crypto = await createInstrument(container, {
      symbol: "BTCUSDT",
      name: "Bitcoin",
      assetType: "CRYPTO",
      market: "BINANCE",
      currency: "USDT",
      providers: [],
    });
    const fx = await createInstrument(container, {
      symbol: "USD/KRW",
      name: "US Dollar / Korean Won",
      assetType: "FX",
      market: "FX",
      currency: "KRW",
      providers: [],
    });

    const result = await container.collection.run();
    expect(result.errors).toEqual([]);

    const expected = new Map([
      [stock.instrumentId, "5m"],
      [etf.instrumentId, "5m"],
      [crypto.instrumentId, "10m"],
      [fx.instrumentId, "90s"],
    ]);
    for (const [instrumentId, interval] of expected) {
      const latest = await container.marketData.getLatest(instrumentId);
      expect(latest?.interval).toBe(interval);
      const [stored] = await container.marketData.getHistorical(instrumentId, { limit: 1 });
      expect(stored?.interval).toBe(interval);
    }
  });
});
