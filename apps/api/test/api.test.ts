import type { Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/api/app";
import type { Container } from "../src/container";
import { createInstrument, createTestContext, FIXED_NOW, makeQuote } from "./helpers";
import type { Instrument, Portfolio } from "@jfolio/shared";

const BASE = "/api/v1";

function appFor(container: Container, config = container.config): Express {
  return createApp(container, config);
}

async function seedPortfolioAndInstrument(
  container: Container,
): Promise<{ portfolio: Portfolio; instrument: Instrument }> {
  const portfolio = await container.portfolios.create({ name: "API Portfolio", baseCurrency: "KRW" });
  const instrument = await createInstrument(container, {
    symbol: "AAA",
    name: "Asset A",
    assetType: "STOCK",
    market: "KRX",
    currency: "KRW",
    providers: [],
  });
  return { portfolio, instrument };
}

describe("8.1 HTTP contract", () => {
  it("serves a public liveness probe without auth", async () => {
    const { container } = createTestContext();
    const res = await request(appFor(container)).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("returns the standard error envelope for unknown routes", async () => {
    const { container } = createTestContext();
    const res = await request(appFor(container)).get(`${BASE}/does-not-exist`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("validates query parameters and returns 422", async () => {
    const { container } = createTestContext();
    const res = await request(appFor(container)).get(`${BASE}/transactions?limit=0`);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toBeDefined();
  });
});

describe("NFR-003 API authentication", () => {
  it("rejects requests without a token when auth is enabled", async () => {
    const { container } = createTestContext(FIXED_NOW, { API_AUTH_TOKEN: "s3cret" });
    const res = await request(appFor(container)).get(`${BASE}/assets`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("accepts a Bearer token", async () => {
    const { container } = createTestContext(FIXED_NOW, { API_AUTH_TOKEN: "s3cret" });
    const res = await request(appFor(container))
      .get(`${BASE}/assets`)
      .set("Authorization", "Bearer s3cret");
    expect(res.status).toBe(200);
  });

  it("accepts an x-api-key token", async () => {
    const { container } = createTestContext(FIXED_NOW, { API_AUTH_TOKEN: "s3cret" });
    const res = await request(appFor(container)).get(`${BASE}/assets`).set("x-api-key", "s3cret");
    expect(res.status).toBe(200);
  });

  it("keeps health endpoints public even when auth is enabled", async () => {
    const { container } = createTestContext(FIXED_NOW, { API_AUTH_TOKEN: "s3cret" });
    expect((await request(appFor(container)).get(`${BASE}/system/health`)).status).toBe(200);
    expect((await request(appFor(container)).get("/health")).status).toBe(200);
  });

  it("rejects a wrong token", async () => {
    const { container } = createTestContext(FIXED_NOW, { API_AUTH_TOKEN: "s3cret" });
    const res = await request(appFor(container))
      .get(`${BASE}/assets`)
      .set("Authorization", "Bearer wrong");
    expect(res.status).toBe(401);
  });
});

describe("8.3 asset master", () => {
  it("creates, lists, reads and deactivates an instrument", async () => {
    const { container } = createTestContext();
    const app = appFor(container);

    const created = await request(app)
      .post(`${BASE}/assets`)
      .send({
        symbol: "005930",
        name: "Samsung Electronics",
        assetType: "STOCK",
        market: "KRX",
        currency: "KRW",
      });
    expect(created.status).toBe(201);
    expect(created.body.instrumentId).toMatch(/^ins_/);
    const id = created.body.instrumentId as string;

    const list = await request(app).get(`${BASE}/assets?assetType=STOCK`);
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].symbol).toBe("005930");

    const read = await request(app).get(`${BASE}/assets/${id}`);
    expect(read.status).toBe(200);
    expect(read.body.latestQuote).toBeNull();

    const removed = await request(app).delete(`${BASE}/assets/${id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.deactivated).toBe(true);
    expect(removed.body.instrument.isActive).toBe(false);
  });

  it("rejects a duplicate natural key with 409", async () => {
    const { container } = createTestContext();
    const app = appFor(container);
    const body = {
      symbol: "AAA",
      name: "Asset A",
      assetType: "STOCK",
      market: "KRX",
      currency: "KRW",
    };
    expect((await request(app).post(`${BASE}/assets`).send(body)).status).toBe(201);
    const dup = await request(app).post(`${BASE}/assets`).send(body);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("CONFLICT");
  });

  it("rejects an invalid body with 422", async () => {
    const { container } = createTestContext();
    const res = await request(appFor(container))
      .post(`${BASE}/assets`)
      .send({ symbol: "X", assetType: "NOT_A_TYPE" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 for a missing instrument", async () => {
    const { container } = createTestContext();
    expect((await request(appFor(container)).get(`${BASE}/assets/ins_missing`)).status).toBe(404);
  });

  it("partially updates an instrument and preserves untouched fields", async () => {
    const { container } = createTestContext();
    const app = appFor(container);
    const created = await request(app).post(`${BASE}/assets`).send({
      symbol: "AAPL",
      name: "Apple Inc.",
      assetType: "STOCK",
      market: "NASDAQ",
      currency: "USD",
      providers: [{ providerId: "yahoo", providerSymbol: "AAPL" }],
    });
    const id = created.body.instrumentId as string;

    const patched = await request(app)
      .patch(`${BASE}/assets/${id}`)
      .send({ name: "Apple Inc. (renamed)", isWatchlist: true });
    expect(patched.status).toBe(200);
    expect(patched.body.name).toBe("Apple Inc. (renamed)");
    expect(patched.body.isWatchlist).toBe(true);
    // Untouched fields keep their original values.
    expect(patched.body.symbol).toBe("AAPL");
    expect(patched.body.market).toBe("NASDAQ");
    expect(patched.body.currency).toBe("USD");
    expect(patched.body.isActive).toBe(true);
    expect(patched.body.providers).toEqual([{ providerId: "yahoo", providerSymbol: "AAPL" }]);
  });

  it("rejects an empty update patch with 422", async () => {
    const { container } = createTestContext();
    const app = appFor(container);
    const created = await request(app)
      .post(`${BASE}/assets`)
      .send({ symbol: "ZZZ", name: "Z", assetType: "STOCK", market: "KRX", currency: "KRW" });
    const res = await request(app)
      .patch(`${BASE}/assets/${created.body.instrumentId}`)
      .send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects renaming onto an existing natural key with 409", async () => {
    const { container } = createTestContext();
    const app = appFor(container);
    const base = { assetType: "STOCK", market: "KRX", currency: "KRW" };
    await request(app).post(`${BASE}/assets`).send({ ...base, symbol: "AAA", name: "A" });
    const second = await request(app)
      .post(`${BASE}/assets`)
      .send({ ...base, symbol: "BBB", name: "B" });

    const clash = await request(app)
      .patch(`${BASE}/assets/${second.body.instrumentId}`)
      .send({ symbol: "AAA" });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("CONFLICT");
  });

  it("reactivates a soft-deleted instrument via patch", async () => {
    const { container } = createTestContext();
    const app = appFor(container);
    const created = await request(app)
      .post(`${BASE}/assets`)
      .send({ symbol: "CCC", name: "C", assetType: "STOCK", market: "KRX", currency: "KRW" });
    const id = created.body.instrumentId as string;

    expect((await request(app).delete(`${BASE}/assets/${id}`)).body.instrument.isActive).toBe(false);
    const restored = await request(app).patch(`${BASE}/assets/${id}`).send({ isActive: true });
    expect(restored.status).toBe(200);
    expect(restored.body.isActive).toBe(true);
  });

  it("returns 404 when patching or deleting a missing instrument", async () => {
    const { container } = createTestContext();
    const app = appFor(container);
    expect(
      (await request(app).patch(`${BASE}/assets/ins_missing`).send({ name: "X" })).status,
    ).toBe(404);
    expect((await request(app).delete(`${BASE}/assets/ins_missing`)).status).toBe(404);
  });

  it("includes the latest quote in the asset list", async () => {
    const { container } = createTestContext();
    const app = appFor(container);
    const priced = await createInstrument(container, {
      symbol: "AAA",
      name: "Asset A",
      assetType: "STOCK",
      market: "KRX",
      currency: "KRW",
      providers: [],
    });
    await createInstrument(container, {
      symbol: "BBB",
      name: "Asset B",
      assetType: "STOCK",
      market: "KRX",
      currency: "KRW",
      providers: [],
    });
    await container.marketData.storeQuote(priced, makeQuote(priced, 1234));

    const list = await request(app).get(`${BASE}/assets`);
    expect(list.status).toBe(200);
    const bySymbol = new Map(
      (list.body.items as Array<{ symbol: string; latestQuote: { price: number } | null }>).map(
        (item) => [item.symbol, item.latestQuote] as const,
      ),
    );
    expect(bySymbol.get("AAA")?.price).toBe(1234);
    expect(bySymbol.get("BBB")).toBeNull();
  });
});

describe("FR-020 latest quote materialisation", () => {
  it("refreshes the latest quote even when the raw quote is a duplicate", async () => {
    const { container } = createTestContext();
    const instrument = await createInstrument(container, {
      symbol: "AAA",
      name: "Asset A",
      assetType: "STOCK",
      market: "KRX",
      currency: "KRW",
      providers: [],
    });

    const first = await container.marketData.storeQuote(instrument, makeQuote(instrument, 100));
    expect(first.stored).toBe(true);
    const second = await container.marketData.storeQuote(instrument, makeQuote(instrument, 100));
    expect(second.duplicate).toBe(true);

    const latest = await container.marketData.getLatest(instrument.instrumentId);
    expect(latest?.price).toBe(100);
  });

  it("does not regress the latest quote when an older quote arrives later", async () => {
    const { container } = createTestContext();
    const instrument = await createInstrument(container, {
      symbol: "AAA",
      name: "Asset A",
      assetType: "STOCK",
      market: "KRX",
      currency: "KRW",
      providers: [],
    });
    const newer = new Date("2026-10-16T10:00:00.000Z");
    const older = new Date("2026-10-16T09:00:00.000Z");

    await container.marketData.storeQuote(
      instrument,
      makeQuote(instrument, 200, { timestamp: newer, interval: "1d" }),
    );
    await container.marketData.storeQuote(
      instrument,
      makeQuote(instrument, 100, { timestamp: older, interval: "1m" }),
    );

    const latest = await container.marketData.getLatest(instrument.instrumentId);
    expect(latest?.price).toBe(200);
    expect(latest?.timestamp.toISOString()).toBe(newer.toISOString());
  });
});

describe("8.4 portfolios", () => {
  it("creates and reads a portfolio, exposing empty holdings", async () => {
    const { container } = createTestContext();
    const app = appFor(container);

    const created = await request(app)
      .post(`${BASE}/portfolios`)
      .send({ name: "My Portfolio", baseCurrency: "KRW" });
    expect(created.status).toBe(201);
    const id = created.body.portfolioId as string;

    expect((await request(app).get(`${BASE}/portfolios`)).body.total).toBe(1);
    expect((await request(app).get(`${BASE}/portfolios/${id}`)).status).toBe(200);

    const holdings = await request(app).get(`${BASE}/portfolios/${id}/holdings`);
    expect(holdings.status).toBe(200);
    expect(holdings.body.items).toEqual([]);
    expect(holdings.body.dataStatus).toBe("NO_DATA");

    expect((await request(app).get(`${BASE}/portfolios/pf_missing`)).status).toBe(404);
  });

  it("updates a portfolio name and base currency", async () => {
    const { container } = createTestContext();
    const app = appFor(container);
    const portfolio = await container.portfolios.create({ name: "Old", baseCurrency: "KRW" });

    const res = await request(app)
      .patch(`${BASE}/portfolios/${portfolio.portfolioId}`)
      .send({ name: "New Name", baseCurrency: "USD" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("New Name");
    expect(res.body.baseCurrency).toBe("USD");

    const read = await request(app).get(`${BASE}/portfolios/${portfolio.portfolioId}`);
    expect(read.body.name).toBe("New Name");
  });

  it("moves the default flag to another portfolio", async () => {
    const { container } = createTestContext();
    const app = appFor(container);
    const first = await container.portfolios.create({ name: "First", baseCurrency: "KRW" });
    const second = await container.portfolios.create({ name: "Second", baseCurrency: "KRW" });
    expect(first.isDefault).toBe(true);

    const res = await request(app)
      .patch(`${BASE}/portfolios/${second.portfolioId}`)
      .send({ isDefault: true });
    expect(res.status).toBe(200);
    expect(res.body.isDefault).toBe(true);

    const list = await request(app).get(`${BASE}/portfolios`);
    const byId = new Map(
      (list.body.items as Array<{ portfolioId: string; isDefault: boolean }>).map((p) => [
        p.portfolioId,
        p.isDefault,
      ]),
    );
    expect(byId.get(second.portfolioId)).toBe(true);
    expect(byId.get(first.portfolioId)).toBe(false);
  });

  it("rejects an empty portfolio patch with 422", async () => {
    const { container } = createTestContext();
    const app = appFor(container);
    const portfolio = await container.portfolios.create({ name: "P", baseCurrency: "KRW" });
    const res = await request(app)
      .patch(`${BASE}/portfolios/${portfolio.portfolioId}`)
      .send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when patching a missing portfolio", async () => {
    const { container } = createTestContext();
    const res = await request(appFor(container))
      .patch(`${BASE}/portfolios/pf_missing`)
      .send({ name: "Nope" });
    expect(res.status).toBe(404);
  });

  it("creates an on-demand snapshot and lists it", async () => {
    const { container } = createTestContext();
    const app = appFor(container);
    const portfolio = await container.portfolios.create({ name: "P", baseCurrency: "KRW" });

    const snapshot = await request(app)
      .post(`${BASE}/portfolios/${portfolio.portfolioId}/snapshots`)
      .send({ snapshotType: "ON_DEMAND", asOf: FIXED_NOW.toISOString() });
    expect(snapshot.status).toBe(201);
    expect(snapshot.body.portfolioId).toBe(portfolio.portfolioId);

    const list = await request(app).get(`${BASE}/portfolios/${portfolio.portfolioId}/snapshots`);
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
  });

  it("reconstructs a history series", async () => {
    const { container } = createTestContext();
    const app = appFor(container);
    const { portfolio, instrument } = await seedPortfolioAndInstrument(container);
    await container.marketData.storeQuote(instrument, makeQuote(instrument, 100));

    const from = new Date(FIXED_NOW.getTime() - 2 * 86_400_000).toISOString();
    const to = FIXED_NOW.toISOString();
    const res = await request(app).get(
      `${BASE}/portfolios/${portfolio.portfolioId}/history?from=${from}&to=${to}&interval=daily`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });
});

describe("8.5 transactions", () => {
  it("records, lists, updates and deletes a transaction", async () => {
    const { container } = createTestContext();
    const app = appFor(container);
    const { portfolio, instrument } = await seedPortfolioAndInstrument(container);

    const created = await request(app)
      .post(`${BASE}/transactions`)
      .send({
        portfolioId: portfolio.portfolioId,
        instrumentId: instrument.instrumentId,
        type: "BUY",
        timestamp: FIXED_NOW.toISOString(),
        quantity: 10,
        price: 100,
      });
    expect(created.status).toBe(201);
    expect(created.body.currency).toBe("KRW");
    const txId = created.body.transactionId as string;

    const list = await request(app).get(
      `${BASE}/transactions?portfolioId=${portfolio.portfolioId}`,
    );
    expect(list.body.total).toBe(1);

    const patched = await request(app).patch(`${BASE}/transactions/${txId}`).send({ quantity: 12 });
    expect(patched.status).toBe(200);
    expect(patched.body.quantity).toBe(12);

    expect((await request(app).delete(`${BASE}/transactions/${txId}`)).status).toBe(204);
    expect((await request(app).get(`${BASE}/transactions/${txId}`)).status).toBe(404);
  });

  it("returns 404 when the portfolio or instrument does not exist", async () => {
    const { container } = createTestContext();
    const app = appFor(container);
    const res = await request(app)
      .post(`${BASE}/transactions`)
      .send({
        portfolioId: "pf_missing",
        instrumentId: "ins_missing",
        type: "BUY",
        timestamp: FIXED_NOW.toISOString(),
        quantity: 1,
        price: 1,
      });
    expect(res.status).toBe(404);
  });

  it("rejects an invalid transaction type with 422", async () => {
    const { container } = createTestContext();
    const res = await request(appFor(container))
      .post(`${BASE}/transactions`)
      .send({
        portfolioId: "pf",
        instrumentId: "ins",
        type: "HODL",
        timestamp: FIXED_NOW.toISOString(),
        quantity: 1,
      });
    expect(res.status).toBe(422);
  });

  it("preserves untouched fields on a partial update", async () => {
    const { container } = createTestContext();
    const app = appFor(container);
    const { portfolio, instrument } = await seedPortfolioAndInstrument(container);

    const created = await request(app)
      .post(`${BASE}/transactions`)
      .send({
        portfolioId: portfolio.portfolioId,
        instrumentId: instrument.instrumentId,
        type: "BUY",
        timestamp: FIXED_NOW.toISOString(),
        quantity: 10,
        price: 100,
        fee: 5,
        memo: "original",
      });
    expect(created.status).toBe(201);

    const patched = await request(app)
      .patch(`${BASE}/transactions/${created.body.transactionId}`)
      .send({ quantity: 12 });

    expect(patched.status).toBe(200);
    expect(patched.body.quantity).toBe(12);
    // A partial update must not reset price/fee via schema defaults.
    expect(patched.body.price).toBe(100);
    expect(patched.body.fee).toBe(5);
    expect(patched.body.memo).toBe("original");
  });

  it("returns 404 when updating or deleting an unknown transaction", async () => {
    const { container } = createTestContext();
    const app = appFor(container);
    const patched = await request(app)
      .patch(`${BASE}/transactions/tx_missing`)
      .send({ quantity: 1 });
    expect(patched.status).toBe(404);
    expect((await request(app).delete(`${BASE}/transactions/tx_missing`)).status).toBe(404);
  });
});

describe("8.6 signals", () => {
  it("creates, lists and deactivates a rule", async () => {
    const { container } = createTestContext();
    const app = appFor(container);
    const { instrument } = await seedPortfolioAndInstrument(container);

    const created = await request(app)
      .post(`${BASE}/signals/rules`)
      .send({
        instrumentId: instrument.instrumentId,
        signalType: "PRICE_DROP",
        threshold: 5,
        referenceType: "FIXED_PRICE",
        referenceValue: 100,
      });
    expect(created.status).toBe(201);
    const ruleId = created.body.ruleId as string;

    expect((await request(app).get(`${BASE}/signals/rules`)).body.total).toBe(1);

    const removed = await request(app).delete(`${BASE}/signals/rules/${ruleId}`);
    expect(removed.status).toBe(200);
    expect(removed.body.rule.isEnabled).toBe(false);
  });

  it("rejects a FIXED_PRICE rule without a referenceValue", async () => {
    const { container } = createTestContext();
    const res = await request(appFor(container))
      .post(`${BASE}/signals/rules`)
      .send({
        instrumentId: "ins_x",
        signalType: "PRICE_DROP",
        threshold: 5,
        referenceType: "FIXED_PRICE",
      });
    expect(res.status).toBe(422);
  });
});

describe("8.2 dashboard", () => {
  it("falls back to the default portfolio, creating it on first access", async () => {
    const { container } = createTestContext();
    const res = await request(appFor(container)).get(`${BASE}/dashboard`);
    expect(res.status).toBe(200);
    expect(res.body.portfolioId).toMatch(/^pf_/);
    expect(res.body.baseCurrency).toBe("KRW");
  });

  it("values a portfolio using stored quotes and never calls providers", async () => {
    const { container } = createTestContext();
    const app = appFor(container);
    const { portfolio, instrument } = await seedPortfolioAndInstrument(container);
    await container.transactions.create({
      portfolioId: portfolio.portfolioId,
      instrumentId: instrument.instrumentId,
      type: "BUY",
      timestamp: FIXED_NOW,
      quantity: 10,
      price: 80,
      currency: "KRW",
      fee: 0,
    });
    await container.marketData.storeQuote(instrument, makeQuote(instrument, 100));

    const res = await request(app).get(`${BASE}/dashboard?portfolioId=${portfolio.portfolioId}`);
    expect(res.status).toBe(200);
    expect(res.body.totalAssetValue).toBe(1000);
    expect(res.body.unrealizedPnL).toBe(200);
    expect(res.body.topHoldings).toHaveLength(1);
    expect(res.body.allocationByAssetType[0].key).toBe("STOCK");
  });

  it("reports a null daily change when the baseline is unavailable", async () => {
    const { container } = createTestContext();
    const app = appFor(container);
    const { portfolio, instrument } = await seedPortfolioAndInstrument(container);
    await container.transactions.create({
      portfolioId: portfolio.portfolioId,
      instrumentId: instrument.instrumentId,
      type: "BUY",
      // Held since before the 24h baseline so the position exists there too.
      timestamp: new Date(FIXED_NOW.getTime() - 2 * 86_400_000),
      quantity: 10,
      price: 80,
      currency: "KRW",
      fee: 0,
    });
    // A quote exists only for "now"; the previous day has no price.
    await container.marketData.storeQuote(instrument, makeQuote(instrument, 100));

    const res = await request(app).get(`${BASE}/dashboard?portfolioId=${portfolio.portfolioId}`);
    expect(res.status).toBe(200);
    expect(res.body.dataStatus).toBe("NORMAL");
    expect(res.body.dailyChange).toBeNull();
    expect(res.body.dailyChangeRate).toBeNull();
  });
});

describe("8.7 system", () => {
  it("exposes provider metadata and data status", async () => {
    const { container } = createTestContext();
    const app = appFor(container);

    const providers = await request(app).get(`${BASE}/system/providers`);
    expect(providers.status).toBe(200);
    expect(providers.body.total).toBeGreaterThan(0);

    const items = providers.body.items as Array<{
      providerId: string;
      schedulerEnabled: boolean;
      collectionIntervals: Array<{ assetType: string; seconds: number }>;
    }>;
    const byId = new Map(items.map((p) => [p.providerId, p] as const));
    // Test config disables the scheduler, so collection is manual only.
    expect(byId.get("mock")?.schedulerEnabled).toBe(false);
    // ETF / CASH have no scheduler tick, so only STOCK / CRYPTO / FX are listed.
    expect(byId.get("mock")?.collectionIntervals).toEqual([
      { assetType: "STOCK", seconds: 60 },
      { assetType: "CRYPTO", seconds: 10 },
      { assetType: "FX", seconds: 60 },
    ]);
    expect(byId.get("binance")?.collectionIntervals).toEqual([
      { assetType: "CRYPTO", seconds: 10 },
    ]);

    const status = await request(app).get(`${BASE}/system/data-status`);
    expect(status.status).toBe(200);
    expect(status.body.status).toBe("NO_DATA");
  });

  it("reports the configured cadence when the scheduler is enabled", async () => {
    const { container } = createTestContext(FIXED_NOW, {
      COLLECTION_SCHEDULER_ENABLED: "true",
      STOCK_COLLECTION_INTERVAL_SECONDS: "300",
    });
    const app = appFor(container);

    const providers = await request(app).get(`${BASE}/system/providers`);
    expect(providers.status).toBe(200);

    const items = providers.body.items as Array<{
      providerId: string;
      schedulerEnabled: boolean;
      collectionIntervals: Array<{ assetType: string; seconds: number }>;
    }>;
    const mock = items.find((p) => p.providerId === "mock");
    expect(mock?.schedulerEnabled).toBe(true);
    expect(mock?.collectionIntervals).toEqual([
      { assetType: "STOCK", seconds: 300 },
      { assetType: "CRYPTO", seconds: 10 },
      { assetType: "FX", seconds: 60 },
    ]);
  });
});
