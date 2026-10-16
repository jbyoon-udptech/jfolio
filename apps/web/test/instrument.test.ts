import { describe, expect, it } from "vitest";
import { formatProviders, parseProviders } from "@/lib/instrument";

describe("instrument provider helpers", () => {
  it("parses a compact provider list", () => {
    expect(parseProviders("binance:BTCUSDT, yahoo:BTC-USD")).toEqual([
      { providerId: "binance", providerSymbol: "BTCUSDT" },
      { providerId: "yahoo", providerSymbol: "BTC-USD" },
    ]);
  });

  it("treats blank input as no providers", () => {
    expect(parseProviders("")).toEqual([]);
    expect(parseProviders("   ,  ")).toEqual([]);
  });

  it("round-trips through formatProviders", () => {
    const links = [
      { providerId: "binance", providerSymbol: "BTCUSDT" },
      { providerId: "frankfurter", providerSymbol: "USDKRW" },
    ];
    expect(parseProviders(formatProviders(links))).toEqual(links);
  });

  it("rejects malformed entries instead of silently dropping them", () => {
    expect(() => parseProviders("binance")).toThrow();
    expect(() => parseProviders(":BTCUSDT")).toThrow();
    expect(() => parseProviders("binance:")).toThrow();
  });
});
