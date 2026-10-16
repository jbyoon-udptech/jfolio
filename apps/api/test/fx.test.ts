import { describe, expect, it } from "vitest";
import { createMemoryRepositories } from "../src/repositories/memory";
import { MarketDataService } from "../src/services/market-data.service";

const NOW = new Date("2026-10-16T12:00:00.000Z");

/** A service backed by a single stored USD/KRW rate. */
async function serviceWithUsdKrw(pegs?: Set<string>): Promise<MarketDataService> {
  const repos = createMemoryRepositories();
  await repos.fxRates.upsertRate({
    base: "USD",
    quote: "KRW",
    rate: 1350,
    timestamp: NOW,
    receivedAt: NOW,
    providerId: "test",
  });
  return new MarketDataService(repos, () => NOW, pegs);
}

describe("MarketDataService.getFxRate stablecoin peg", () => {
  it("converts a USDT-priced asset to the base currency via USD", async () => {
    const svc = await serviceWithUsdKrw();
    expect(await svc.getFxRate("USDT", "KRW", NOW)).toBe(1350);
  });

  it("treats a stablecoin as 1:1 with USD in both directions", async () => {
    const svc = await serviceWithUsdKrw();
    expect(await svc.getFxRate("USDT", "USD", NOW)).toBe(1);
    expect(await svc.getFxRate("USD", "USDT", NOW)).toBe(1);
  });

  it("treats two different stablecoins as 1:1", async () => {
    const svc = await serviceWithUsdKrw();
    expect(await svc.getFxRate("USDT", "USDC", NOW)).toBe(1);
  });

  it("inverts a stored fiat rate for the reverse direction", async () => {
    const svc = await serviceWithUsdKrw();
    expect(await svc.getFxRate("KRW", "USD", NOW)).toBeCloseTo(1 / 1350, 12);
  });

  it("returns null for an unpegged currency with no stored rate", async () => {
    const svc = await serviceWithUsdKrw();
    expect(await svc.getFxRate("JPY", "KRW", NOW)).toBeNull();
  });

  it("does not peg when the configured peg set is empty", async () => {
    const svc = await serviceWithUsdKrw(new Set());
    expect(await svc.getFxRate("USDT", "KRW", NOW)).toBeNull();
  });

  it("prefers a directly stored rate over the peg", async () => {
    const repos = createMemoryRepositories();
    await repos.fxRates.upsertRate({
      base: "USD",
      quote: "KRW",
      rate: 1350,
      timestamp: NOW,
      receivedAt: NOW,
      providerId: "test",
    });
    await repos.fxRates.upsertRate({
      base: "USDT",
      quote: "KRW",
      rate: 1400,
      timestamp: NOW,
      receivedAt: NOW,
      providerId: "test",
    });
    const svc = new MarketDataService(repos, () => NOW);
    expect(await svc.getFxRate("USDT", "KRW", NOW)).toBe(1400);
  });
});
