import type { Instrument } from "@jfolio/shared";
import { describe, expect, it } from "vitest";
import { FrankfurterFxProvider } from "../src/providers/fx/frankfurter.provider";

function fxInstrument(overrides: Partial<Instrument> = {}): Instrument {
  return {
    instrumentId: "ins_fx",
    symbol: "USD/KRW",
    name: "US Dollar / Korean Won",
    assetType: "FX",
    market: "FX",
    currency: "KRW",
    isActive: true,
    isWatchlist: false,
    providers: [{ providerId: "frankfurter", providerSymbol: "USD" }],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

/** Records the URLs a provider requests and replies with a canned payload. */
function recordingFetch(payload: unknown): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("Frankfurter FX provider", () => {
  it("builds base/symbols from a base-currency providerSymbol", async () => {
    const { fetchImpl, calls } = recordingFetch({
      amount: 1,
      base: "USD",
      date: "2026-10-15",
      rates: { KRW: 1345.9 },
    });
    const provider = new FrankfurterFxProvider("https://api.frankfurter.dev", fetchImpl);

    const quote = await provider.getLatestQuote(fxInstrument());

    expect(calls[0]).toBe("https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW");
    expect(quote?.price).toBe(1345.9);
    expect(quote?.currency).toBe("KRW");
    expect(quote?.interval).toBe("1d");
  });

  it("tolerates a full pair mistakenly stored in providerSymbol", async () => {
    const { fetchImpl, calls } = recordingFetch({
      amount: 1,
      base: "USD",
      date: "2026-10-15",
      rates: { KRW: 1345.9 },
    });
    const provider = new FrankfurterFxProvider("https://api.frankfurter.dev", fetchImpl);

    await provider.getLatestQuote(
      fxInstrument({ providers: [{ providerId: "frankfurter", providerSymbol: "USD/KRW" }] }),
    );

    expect(calls[0]).toBe("https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW");
  });

  it("returns null when the requested rate is absent", async () => {
    const { fetchImpl } = recordingFetch({
      amount: 1,
      base: "USD",
      date: "2026-10-15",
      rates: {},
    });
    const provider = new FrankfurterFxProvider("https://api.frankfurter.dev", fetchImpl);
    expect(await provider.getLatestQuote(fxInstrument())).toBeNull();
  });
});
