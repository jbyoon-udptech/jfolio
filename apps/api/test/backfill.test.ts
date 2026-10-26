import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/api/app";
import type { Container } from "../src/container";
import { parseBackfillArgs } from "../src/cli/backfill-args";
import {
  createInstrument,
  createPortfolio,
  createTestContext,
  FIXED_NOW,
} from "./helpers";

const BASE = "/api/v1";

function appFor(container: Container) {
  return createApp(container, container.config);
}

describe("historical backfill", () => {
  it("stores daily history and is idempotent", async () => {
    const { container } = createTestContext();
    const instrument = await createInstrument(container, {
      symbol: "005930",
      name: "Samsung Electronics",
      assetType: "STOCK",
      market: "KRX",
      currency: "KRW",
      providers: [],
    });
    const from = new Date("2026-10-10T00:00:00.000Z");
    const to = new Date("2026-10-16T12:00:00.000Z");

    const first = await container.backfill.backfillInstrument(instrument, { from, to });
    expect(first.status).toBe("OK");
    expect(first.providerId).toBe("mock");
    expect(first.from).toBe(from.toISOString());
    expect(first.to).toBe(to.toISOString());
    expect(first.inserted).toBe(7);
    expect(first.duplicates).toBe(0);

    const stored = await container.marketData.getHistorical(instrument.instrumentId, {
      interval: "1d",
      from,
      to,
    });
    expect(stored).toHaveLength(7);

    const second = await container.backfill.backfillInstrument(instrument, { from, to });
    expect(second.status).toBe("OK");
    expect(second.inserted).toBe(0);
    expect(second.duplicates).toBe(7);

    const afterRepeat = await container.marketData.getHistorical(instrument.instrumentId, {
      interval: "1d",
      from,
      to,
    });
    expect(afterRepeat).toHaveLength(7);
  });

  it("starts one day before the first transaction", async () => {
    const { container } = createTestContext();
    const portfolio = await createPortfolio(container);
    const instrument = await createInstrument(container, {
      symbol: "AAPL",
      name: "Apple Inc.",
      assetType: "STOCK",
      market: "NASDAQ",
      currency: "KRW",
      providers: [],
    });
    await container.transactions.create({
      portfolioId: portfolio.portfolioId,
      instrumentId: instrument.instrumentId,
      type: "BUY",
      timestamp: new Date("2026-10-10T00:00:00.000Z"),
      quantity: 1,
      price: 100,
      fee: 0,
    });

    const result = await container.backfill.backfillInstrument(instrument);
    expect(result.status).toBe("OK");
    expect(result.from).toBe("2026-10-09T00:00:00.000Z");
    expect(result.to).toBe(FIXED_NOW.toISOString());
    expect(result.inserted).toBe(8);
  });

  it("uses an explicit lookback window when requested", async () => {
    const { container } = createTestContext();
    const instrument = await createInstrument(container, {
      symbol: "005930",
      name: "Samsung Electronics",
      assetType: "STOCK",
      market: "KRX",
      currency: "KRW",
      providers: [],
    });

    const result = await container.backfill.backfillInstrument(instrument, { days: 2 });
    expect(result.status).toBe("OK");
    expect(result.from).toBe("2026-10-14T00:00:00.000Z");
    expect(result.to).toBe(FIXED_NOW.toISOString());
    expect(result.inserted).toBe(3);
  });

  it("skips instruments with no provider", async () => {
    const { container } = createTestContext();
    const cash = await createInstrument(container, {
      symbol: "KRW",
      name: "Korean Won",
      assetType: "CASH",
      market: "CASH",
      currency: "KRW",
      providers: [],
    });

    const result = await container.backfill.backfillInstrument(cash);
    expect(result.status).toBe("SKIPPED");
    expect(result.message).toContain("no market data provider");
    expect(result.inserted).toBe(0);
  });

  it("filters a full run by asset type and aggregates counts", async () => {
    const { container } = createTestContext();
    const stock = await createInstrument(container, {
      symbol: "005930",
      name: "Samsung Electronics",
      assetType: "STOCK",
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
    const from = new Date("2026-10-14T00:00:00.000Z");
    const to = new Date("2026-10-16T12:00:00.000Z");

    const result = await container.backfill.backfillAll({
      from,
      to,
      assetTypes: ["CRYPTO"],
    });
    expect(result.instrumentsProcessed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.results[0]?.instrumentId).toBe(crypto.instrumentId);
    expect(result.inserted).toBe(3);
    expect(result.results.some((item) => item.instrumentId === stock.instrumentId)).toBe(false);
  });

  it("tracks background work until it is idle", async () => {
    const { container } = createTestContext();
    const instrument = await createInstrument(container, {
      symbol: "005930",
      name: "Samsung Electronics",
      assetType: "STOCK",
      market: "KRX",
      currency: "KRW",
      providers: [],
    });

    const task = container.backfill.enqueue(instrument, {
      from: new Date("2026-10-15T00:00:00.000Z"),
      to: new Date("2026-10-16T12:00:00.000Z"),
    });
    await container.backfill.waitForIdle();
    await expect(task).resolves.toMatchObject({ status: "OK", inserted: 2 });
  });
});

describe("automatic backfill on asset creation", () => {
  it("fills history in the background without blocking the create response", async () => {
    const { container } = createTestContext(FIXED_NOW, {
      HISTORY_BACKFILL_ENABLED: "true",
      HISTORY_BACKFILL_DAYS: "3",
    });
    const app = appFor(container);

    const created = await request(app).post(`${BASE}/assets`).send({
      symbol: "005930",
      name: "Samsung Electronics",
      assetType: "STOCK",
      market: "KRX",
      currency: "KRW",
    });
    expect(created.status).toBe(201);
    expect(created.body.latestQuote).toBeUndefined();

    await container.backfill.waitForIdle();

    const read = await request(app).get(`${BASE}/assets/${created.body.instrumentId as string}`);
    expect(read.status).toBe(200);
    expect(read.body.latestQuote).not.toBeNull();
    expect(read.body.latestQuote.interval).toBe("1d");

    const quotes = await request(app).get(
      `${BASE}/assets/${created.body.instrumentId as string}/quotes?interval=1d`,
    );
    expect(quotes.status).toBe(200);
    expect(quotes.body.total).toBeGreaterThan(0);
  });

  it("does nothing when automatic backfill is disabled", async () => {
    const { container } = createTestContext();
    const app = appFor(container);

    const created = await request(app).post(`${BASE}/assets`).send({
      symbol: "005930",
      name: "Samsung Electronics",
      assetType: "STOCK",
      market: "KRX",
      currency: "KRW",
    });
    expect(created.status).toBe(201);
    await container.backfill.waitForIdle();

    const read = await request(app).get(`${BASE}/assets/${created.body.instrumentId as string}`);
    expect(read.body.latestQuote).toBeNull();
  });
});

describe("backfill CLI arguments", () => {
  it("parses ranges and filters", () => {
    const options = parseBackfillArgs(
      [
        "--from=2026-10-01",
        "--to",
        "2026-10-10",
        "--days",
        "30",
        "--asset-type",
        "stock, ETF",
        "--instrument",
        "ins_a,ins_b,ins_a",
        "--interval",
        "1d",
      ],
    );

    expect(options.from?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(options.to?.toISOString()).toBe("2026-10-10T23:59:59.999Z");
    expect(options.days).toBe(30);
    expect(options.assetTypes).toEqual(["STOCK", "ETF"]);
    expect(options.instrumentIds).toEqual(["ins_a", "ins_b"]);
    expect(options.interval).toBe("1d");
    expect(options.help).toBe(false);
  });

  it("leaves the lookback unset by default and uses a daily interval", () => {
    const options = parseBackfillArgs([]);
    expect(options.from).toBeUndefined();
    expect(options.to).toBeUndefined();
    expect(options.days).toBeUndefined();
    expect(options.interval).toBe("1d");
  });

  it("short-circuits for help", () => {
    expect(parseBackfillArgs(["--help"]).help).toBe(true);
    expect(parseBackfillArgs(["-h", "--unknown"]).help).toBe(true);
  });

  it("rejects invalid values before touching the database", () => {
    expect(() => parseBackfillArgs(["--days", "0"])).toThrow(/positive integer/);
    expect(() => parseBackfillArgs(["--from", "not-a-date"])).toThrow(/Invalid --from/);
    expect(() => parseBackfillArgs(["--asset-type", "NOPE"])).toThrow(/Unknown asset type/);
    expect(() => parseBackfillArgs(["--interval", "2d"])).toThrow(/Unknown interval/);
    expect(() => parseBackfillArgs(["--from", "2026-10-10", "--to", "2026-10-01"])).toThrow(
      /before/,
    );
    expect(() => parseBackfillArgs(["--unknown"])).toThrow(/Unknown option/);
  });
});
