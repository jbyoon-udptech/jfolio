import type { Transaction } from "@jfolio/shared";
import { describe, expect, it } from "vitest";
import { calculatePositions } from "../src/domain/position-calculator";
import { createInstrument, createPortfolio, createTestContext, FIXED_NOW, makeQuote } from "./helpers";

/** Build a ledger row for the pure position calculator. */
function tx(
  overrides: Partial<Transaction> & Pick<Transaction, "type" | "quantity" | "price">,
): Transaction {
  return {
    transactionId: `tx_${Math.random().toString(36).slice(2)}`,
    portfolioId: "pf",
    instrumentId: "ins",
    timestamp: FIXED_NOW,
    currency: "KRW",
    fee: 0,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides,
  };
}

describe("14.1 financial calculations", () => {
  it("T-001: quantity 10 at price 100 values at 1,000", async () => {
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
    await container.transactions.create({
      portfolioId: portfolio.portfolioId,
      instrumentId: instrument.instrumentId,
      type: "BUY",
      timestamp: FIXED_NOW,
      quantity: 10,
      price: 100,
      currency: "KRW",
      fee: 0,
    });
    await container.marketData.storeQuote(instrument, makeQuote(instrument, 100));

    const valuation = await container.valuation.valuate(portfolio.portfolioId, { asOf: FIXED_NOW });
    expect(valuation.positions).toHaveLength(1);
    expect(valuation.positions[0]?.marketValue).toBe(1000);
    expect(valuation.totalAssetValue).toBe(1000);
  });

  it("T-002: cost basis 800 at price 100 yields unrealised P&L 200", async () => {
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

    const valuation = await container.valuation.valuate(portfolio.portfolioId, { asOf: FIXED_NOW });
    expect(valuation.positions[0]?.costBasisBase).toBe(800);
    expect(valuation.positions[0]?.unrealizedPnL).toBe(200);
    expect(valuation.unrealizedPnL).toBe(200);
    expect(valuation.unrealizedReturn).toBe(25);
  });

  it("T-002b: buy fees are included in the cost basis", () => {
    const { positions } = calculatePositions("pf", [
      tx({ type: "BUY", quantity: 10, price: 80, fee: 5 }),
    ]);
    expect(positions[0]?.costBasis).toBe(805);
    expect(positions[0]?.averageCost).toBe(80.5);
  });

  it("T-003: USD asset of 100 with rate 1,400 values at 140,000 KRW", async () => {
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
    await container.marketData.storeQuote(fx, makeQuote(fx, 1400));
    const usd = await createInstrument(container, {
      symbol: "AAPL",
      name: "Apple Inc.",
      assetType: "STOCK",
      market: "NASDAQ",
      currency: "USD",
      providers: [],
    });
    await container.transactions.create({
      portfolioId: portfolio.portfolioId,
      instrumentId: usd.instrumentId,
      type: "BUY",
      timestamp: FIXED_NOW,
      quantity: 1,
      price: 100,
      currency: "USD",
      fee: 0,
    });
    await container.marketData.storeQuote(usd, makeQuote(usd, 100));

    const valuation = await container.valuation.valuate(portfolio.portfolioId, { asOf: FIXED_NOW });
    const position = valuation.positions.find((p) => p.instrumentId === usd.instrumentId);
    expect(position?.marketValue).toBe(100);
    expect(position?.fxRateToBase).toBe(1400);
    expect(position?.marketValueBase).toBe(140000);
    expect(valuation.totalAssetValue).toBe(140000);
  });

  it("T-004: buying 10 then selling 3 leaves 7 units", () => {
    const { positions } = calculatePositions("pf", [
      tx({ type: "BUY", quantity: 10, price: 100 }),
      tx({ type: "SELL", quantity: 3, price: 120 }),
    ]);
    expect(positions[0]?.quantity).toBe(7);
    expect(positions[0]?.costBasis).toBe(700);
  });

  it("T-004b: fractional quantities are handled exactly", () => {
    const { positions } = calculatePositions("pf", [
      tx({ type: "BUY", quantity: 0.15, price: 62000 }),
      tx({ type: "SELL", quantity: 0.05, price: 65000 }),
    ]);
    expect(positions[0]?.quantity).toBeCloseTo(0.1, 10);
    expect(positions[0]?.costBasis).toBeCloseTo(6200, 6);
  });

  it("T-005: a portfolio without transactions has no holdings", async () => {
    const { container } = createTestContext();
    const portfolio = await createPortfolio(container);
    const positions = await container.positions.getPositions(portfolio.portfolioId);
    expect(positions).toHaveLength(0);

    const valuation = await container.valuation.valuate(portfolio.portfolioId, { asOf: FIXED_NOW });
    expect(valuation.positions).toHaveLength(0);
    expect(valuation.dataStatus).toBe("NO_DATA");
  });

  it("T-006: a missing FX rate marks the position UNAVAILABLE instead of 0", async () => {
    const { container } = createTestContext();
    const portfolio = await createPortfolio(container, "KRW");
    const usd = await createInstrument(container, {
      symbol: "AAPL",
      name: "Apple Inc.",
      assetType: "STOCK",
      market: "NASDAQ",
      currency: "USD",
      providers: [],
    });
    await container.transactions.create({
      portfolioId: portfolio.portfolioId,
      instrumentId: usd.instrumentId,
      type: "BUY",
      timestamp: FIXED_NOW,
      quantity: 1,
      price: 100,
      currency: "USD",
      fee: 0,
    });
    await container.marketData.storeQuote(usd, makeQuote(usd, 100));

    const valuation = await container.valuation.valuate(portfolio.portfolioId, { asOf: FIXED_NOW });
    expect(valuation.positions[0]?.status).toBe("UNAVAILABLE");
    expect(valuation.positions[0]?.statusReason).toBe("NO_FX_RATE");
    expect(valuation.unavailableCount).toBe(1);
    expect(valuation.dataStatus).toBe("UNAVAILABLE");
    // The unavailable position must not silently contribute a zero valuation.
    expect(valuation.positions[0]?.marketValueBase).toBeNull();
  });

  it("T-007: cancelling a transaction and recomputing restores quantity and cost", async () => {
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
    await container.transactions.create({
      portfolioId: portfolio.portfolioId,
      instrumentId: instrument.instrumentId,
      type: "BUY",
      timestamp: FIXED_NOW,
      quantity: 10,
      price: 100,
      currency: "KRW",
      fee: 0,
    });
    const sell = await container.transactions.create({
      portfolioId: portfolio.portfolioId,
      instrumentId: instrument.instrumentId,
      type: "SELL",
      timestamp: new Date(FIXED_NOW.getTime() + 1000),
      quantity: 4,
      price: 120,
      currency: "KRW",
      fee: 0,
    });

    let positions = await container.positions.getPositions(portfolio.portfolioId);
    expect(positions[0]?.quantity).toBe(6);

    await container.transactions.delete(sell.transactionId);
    positions = await container.positions.getPositions(portfolio.portfolioId);
    expect(positions[0]?.quantity).toBe(10);
    expect(positions[0]?.costBasis).toBe(1000);
  });

  it("T-008: storing the same quote twice does not create duplicates", async () => {
    const { container, repos } = createTestContext();
    const instrument = await createInstrument(container, {
      symbol: "AAA",
      name: "Asset A",
      assetType: "STOCK",
      market: "KRX",
      currency: "KRW",
      providers: [],
    });
    const quote = makeQuote(instrument, 100);

    const first = await container.marketData.storeQuote(instrument, quote);
    const second = await container.marketData.storeQuote(instrument, quote);

    expect(first.stored).toBe(true);
    expect(second.stored).toBe(false);
    expect(second.duplicate).toBe(true);

    const history = await repos.quotes.getHistorical(instrument.instrumentId);
    expect(history).toHaveLength(1);
  });
});
