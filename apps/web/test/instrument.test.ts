import { describe, expect, it } from "vitest";
import {
  CURRENCY_CODES,
  currencyOptions,
  defaultProviderSymbol,
  groupByCurrency,
  MARKET_OPTIONS,
  marketOptions,
  normalizeProviderLink,
  PROVIDER_OPTIONS,
  providerOptions,
} from "@/lib/instrument";

describe("instrument provider helpers", () => {
  it("normalizes and trims a provider link", () => {
    expect(normalizeProviderLink(" yahoo ", " AAPL ")).toEqual({
      providerId: "yahoo",
      providerSymbol: "AAPL",
    });
  });

  it("returns null when no provider is selected", () => {
    expect(normalizeProviderLink("", "")).toBeNull();
    expect(normalizeProviderLink("   ", "   ")).toBeNull();
  });

  it("rejects a partially filled provider link", () => {
    expect(() => normalizeProviderLink("yahoo", "")).toThrow();
    expect(() => normalizeProviderLink("", "AAPL")).toThrow();
  });

  it("keeps an existing non-standard provider selectable", () => {
    expect(providerOptions("yahoo")).toEqual(PROVIDER_OPTIONS);
    expect(providerOptions("mock").map((option) => option.providerId)).toEqual([
      "mock",
      ...PROVIDER_OPTIONS.map((option) => option.providerId),
    ]);
  });
});

describe("defaultProviderSymbol", () => {
  it("uses the asset code while the provider symbol is empty", () => {
    expect(defaultProviderSymbol("AAPL", "", "")).toBe("AAPL");
  });

  it("follows the code while it still mirrors the previous code", () => {
    expect(defaultProviderSymbol("MSFT", "AAPL", "AAPL")).toBe("MSFT");
  });

  it("keeps a manually edited provider symbol", () => {
    expect(defaultProviderSymbol("MSFT", "AAPL.US", "AAPL")).toBe("AAPL.US");
  });

  it("clears the default when the code is cleared", () => {
    expect(defaultProviderSymbol("", "AAPL", "AAPL")).toBe("");
  });
});

describe("instrument market options", () => {
  it("offers the standard market list", () => {
    expect(marketOptions("NASDAQ")).toEqual([...MARKET_OPTIONS]);
  });

  it("keeps an existing non-standard market selectable", () => {
    expect(marketOptions("LSE")).toEqual(["LSE", ...MARKET_OPTIONS]);
    expect(marketOptions(" lse ")).toEqual(["lse", ...MARKET_OPTIONS]);
  });

  it("uses the standard list when no market is selected", () => {
    expect(marketOptions("")).toEqual([...MARKET_OPTIONS]);
  });
});

describe("instrument currency options", () => {
  it("offers the standard currency list", () => {
    expect(currencyOptions("KRW")).toEqual([...CURRENCY_CODES]);
  });

  it("keeps an existing non-standard currency selectable", () => {
    expect(currencyOptions("GBP")).toEqual(["GBP", ...CURRENCY_CODES]);
    expect(currencyOptions(" gbp ")).toEqual(["GBP", ...CURRENCY_CODES]);
  });
});

describe("groupByCurrency", () => {
  it("groups items by normalized currency in the standard order", () => {
    const groups = groupByCurrency([
      { id: "btc", currency: "usdt" },
      { id: "aapl", currency: "USD" },
      { id: "samsung", currency: "KRW" },
      { id: "msft", currency: " USD " },
      { id: "gbp", currency: "GBP" },
    ]);

    expect(groups.map((group) => group.currency)).toEqual([
      "KRW",
      "USD",
      "USDT",
      "GBP",
    ]);
    expect(
      groups
        .find((group) => group.currency === "USD")
        ?.items.map((item) => item.id),
    ).toEqual(["aapl", "msft"]);
  });

  it("uses 기타 for a blank currency", () => {
    expect(groupByCurrency([{ id: "unknown", currency: " " }])).toEqual([
      { currency: "기타", items: [{ id: "unknown", currency: " " }] },
    ]);
  });
});
