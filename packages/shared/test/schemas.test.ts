import { describe, expect, it } from "vitest";
import {
  booleanQuery,
  createSignalRuleSchema,
  createTransactionSchema,
  currencyCode,
  roundCurrency,
  roundTo,
  updateInstrumentSchema,
  updatePortfolioSchema,
  updateSignalRuleSchema,
} from "../src/index";

describe("shared Zod schemas", () => {
  it("applies transaction defaults and coerces the timestamp to a Date", () => {
    const parsed = createTransactionSchema.parse({
      portfolioId: "p1",
      instrumentId: "i1",
      type: "BUY",
      timestamp: "2026-10-16T12:00:00.000Z",
      quantity: 10,
    });
    expect(parsed.price).toBe(0);
    expect(parsed.fee).toBe(0);
    expect(parsed.timestamp).toBeInstanceOf(Date);
    expect(parsed.timestamp.toISOString()).toBe("2026-10-16T12:00:00.000Z");
    // `currency` is optional and resolved later from the instrument.
    expect(parsed.currency).toBeUndefined();
  });

  it("rejects negative price and fee but allows any finite quantity", () => {
    expect(() =>
      createTransactionSchema.parse({
        portfolioId: "p1",
        instrumentId: "i1",
        type: "BUY",
        timestamp: "2026-10-16T12:00:00.000Z",
        quantity: 1,
        price: -1,
      }),
    ).toThrow();
    expect(() =>
      createTransactionSchema.parse({
        portfolioId: "p1",
        instrumentId: "i1",
        type: "BUY",
        timestamp: "2026-10-16T12:00:00.000Z",
        quantity: 1,
        fee: -0.5,
      }),
    ).toThrow();
  });

  it("requires referenceValue for FIXED_PRICE signal rules", () => {
    const base = {
      instrumentId: "i1",
      signalType: "PRICE_THRESHOLD" as const,
      threshold: 100,
      referenceType: "FIXED_PRICE" as const,
    };
    expect(() => createSignalRuleSchema.parse(base)).toThrow();
    const ok = createSignalRuleSchema.parse({ ...base, referenceValue: 100 });
    expect(ok.isEnabled).toBe(true);
    expect(ok.referenceValue).toBe(100);
  });

  it("rejects negative signal thresholds", () => {
    expect(() =>
      createSignalRuleSchema.parse({
        instrumentId: "i1",
        signalType: "PRICE_DROP",
        threshold: -1,
        referenceType: "PREVIOUS_CLOSE",
      }),
    ).toThrow();
  });

  it("validates update patches independently", () => {
    const patch = updateSignalRuleSchema.parse({ isEnabled: false, cooldownSeconds: 60 });
    expect(patch).toEqual({ isEnabled: false, cooldownSeconds: 60 });
  });

  it("validates portfolio update patches and rejects empty ones", () => {
    expect(updatePortfolioSchema.parse({ name: "Renamed" })).toEqual({ name: "Renamed" });
    expect(updatePortfolioSchema.parse({ baseCurrency: "USD", isDefault: true })).toEqual({
      baseCurrency: "USD",
      isDefault: true,
    });
    expect(() => updatePortfolioSchema.parse({})).toThrow();
    expect(() => updatePortfolioSchema.parse({ baseCurrency: "usd" })).toThrow();
  });

  it("validates instrument update patches and rejects empty ones", () => {
    expect(updateInstrumentSchema.parse({ name: "Renamed" })).toEqual({ name: "Renamed" });
    expect(updateInstrumentSchema.parse({ isWatchlist: true })).toEqual({ isWatchlist: true });
    expect(updateInstrumentSchema.parse({ isActive: false })).toEqual({ isActive: false });
    expect(() => updateInstrumentSchema.parse({})).toThrow();
    expect(() => updateInstrumentSchema.parse({ assetType: "NOT_A_TYPE" })).toThrow();
  });

  it("parses query-string booleans safely", () => {
    expect(booleanQuery.parse("true")).toBe(true);
    expect(booleanQuery.parse("1")).toBe(true);
    expect(booleanQuery.parse("false")).toBe(false);
    expect(booleanQuery.parse("0")).toBe(false);
    expect(booleanQuery.parse(true)).toBe(true);
  });

  it("enforces ISO-4217-like currency codes", () => {
    expect(currencyCode.parse("KRW")).toBe("KRW");
    expect(currencyCode.parse("USDT")).toBe("USDT");
    expect(() => currencyCode.parse("krw")).toThrow();
    expect(() => currencyCode.parse("K")).toThrow();
  });
});

describe("shared numeric helpers", () => {
  it("rounds to a fixed number of digits", () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(2.345, 2)).toBe(2.35);
    expect(roundTo(Number.NaN, 2)).toBeNaN();
  });

  it("uses currency-specific precision (KRW/JPY => 0 digits)", () => {
    expect(roundCurrency(1234.6, "KRW")).toBe(1235);
    expect(roundCurrency(1234.6, "USD")).toBe(1234.6);
    expect(roundCurrency(100.4, "JPY")).toBe(100);
  });
});
