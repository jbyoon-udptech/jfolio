import type { Instrument } from "@jfolio/shared";
import { describe, expect, it } from "vitest";
import { FrankfurterFxProvider } from "../src/providers/fx/frankfurter.provider";
import { YahooStockProvider } from "../src/providers/stocks/yahoo.provider";
import { yahooSymbolCandidates } from "../src/providers/stocks/yahoo-symbol";

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

describe("yahooSymbolCandidates", () => {
  it("expands a bare KRX code to both Korean boards", () => {
    expect(yahooSymbolCandidates("000660", "KRX")).toEqual(["000660.KS", "000660.KQ"]);
  });

  it("maps explicit KOSPI/KOSDAQ markets to one suffix", () => {
    expect(yahooSymbolCandidates("005930", "KOSPI")).toEqual(["005930.KS"]);
    expect(yahooSymbolCandidates("091990", "KOSDAQ")).toEqual(["091990.KQ"]);
    expect(yahooSymbolCandidates("005930", "kospi")).toEqual(["005930.KS"]);
  });

  it("respects an explicit exchange suffix", () => {
    expect(yahooSymbolCandidates("005930.KS", "KRX")).toEqual(["005930.KS"]);
    expect(yahooSymbolCandidates("7203.T", "TSE")).toEqual(["7203.T"]);
  });

  it("leaves non-Korean symbols untouched", () => {
    expect(yahooSymbolCandidates("AAPL", "NASDAQ")).toEqual(["AAPL"]);
    // KRX market but not a 6-digit code: do not guess a suffix.
    expect(yahooSymbolCandidates("HXSCL", "KRX")).toEqual(["HXSCL"]);
  });

  it("returns no candidates for a blank symbol", () => {
    expect(yahooSymbolCandidates("", "KRX")).toEqual([]);
    expect(yahooSymbolCandidates("   ", "KRX")).toEqual([]);
  });
});

function stockInstrument(overrides: Partial<Instrument> = {}): Instrument {
  return {
    instrumentId: "ins_krx",
    symbol: "000660",
    name: "SK하이닉스",
    assetType: "STOCK",
    market: "KRX",
    currency: "KRW",
    isActive: true,
    isWatchlist: false,
    providers: [],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function yahooPayload(
  symbol: string,
  price: number,
  opts: { currency?: string; type?: string } = {},
) {
  return {
    chart: {
      result: [
        {
          meta: {
            currency: opts.currency ?? "KRW",
            symbol,
            regularMarketPrice: price,
            regularMarketTime: 1_700_000_000,
            instrumentType: opts.type ?? "EQUITY",
          },
          indicators: { quote: [{}] },
        },
      ],
      error: null,
    },
  };
}

const yahooNotFound = { chart: { result: null, error: { code: "Not Found" } } };

/** Replies with the payload whose `match` is contained in the URL. */
function routedFetch(
  routes: Array<{ match: string; payload: unknown }>,
): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    const route = routes.find((candidate) => url.includes(candidate.match));
    const payload = route ? route.payload : yahooNotFound;
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("Yahoo stock provider symbol resolution", () => {
  it("derives the .KS suffix for a bare KRX code", async () => {
    const { fetchImpl, calls } = routedFetch([
      { match: "000660.KS", payload: yahooPayload("000660.KS", 127_200) },
    ]);
    const provider = new YahooStockProvider("https://query1.finance.yahoo.com", fetchImpl);

    const quote = await provider.getLatestQuote(stockInstrument());

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/chart/000660.KS?");
    expect(quote?.price).toBe(127_200);
  });

  it("falls back to .KQ when the .KS candidate has no data", async () => {
    const { fetchImpl, calls } = routedFetch([
      { match: "091990.KQ", payload: yahooPayload("091990.KQ", 55_000) },
    ]);
    const provider = new YahooStockProvider("https://query1.finance.yahoo.com", fetchImpl);

    const quote = await provider.getLatestQuote(stockInstrument({ symbol: "091990" }));

    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("/chart/091990.KS?");
    expect(calls[1]).toContain("/chart/091990.KQ?");
    expect(quote?.price).toBe(55_000);
  });

  it("skips a derived candidate whose Yahoo instrument type is wrong", async () => {
    // A KOSDAQ code requested as `.KS` resolves to an unrelated MUTUALFUND that
    // shares the code; the provider must skip it and use the `.KQ` equity.
    const { fetchImpl, calls } = routedFetch([
      { match: "247540.KS", payload: yahooPayload("247540.KS", 194_000, { type: "MUTUALFUND" }) },
      { match: "247540.KQ", payload: yahooPayload("247540.KQ", 106_900, { type: "EQUITY" }) },
    ]);
    const provider = new YahooStockProvider("https://query1.finance.yahoo.com", fetchImpl);

    const quote = await provider.getLatestQuote(stockInstrument({ symbol: "247540" }));

    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("/chart/247540.KS?");
    expect(calls[1]).toContain("/chart/247540.KQ?");
    expect(quote?.price).toBe(106_900);
  });

  it("trusts an explicit suffix even when the Yahoo type differs", async () => {
    // An explicit `.KS` is the user's choice; do not second-guess it.
    const { fetchImpl, calls } = routedFetch([
      { match: "247540.KS", payload: yahooPayload("247540.KS", 194_000, { type: "MUTUALFUND" }) },
    ]);
    const provider = new YahooStockProvider("https://query1.finance.yahoo.com", fetchImpl);

    const quote = await provider.getLatestQuote(
      stockInstrument({
        symbol: "247540",
        providers: [{ providerId: "yahoo", providerSymbol: "247540.KS" }],
      }),
    );

    expect(calls).toHaveLength(1);
    expect(quote?.price).toBe(194_000);
  });

  it("uses an explicit providerSymbol verbatim", async () => {
    const { fetchImpl, calls } = routedFetch([
      { match: "AAPL", payload: yahooPayload("AAPL", 190, { currency: "USD" }) },
    ]);
    const provider = new YahooStockProvider("https://query1.finance.yahoo.com", fetchImpl);

    await provider.getLatestQuote(
      stockInstrument({
        symbol: "AAPL",
        market: "NASDAQ",
        currency: "USD",
        providers: [{ providerId: "yahoo", providerSymbol: "AAPL" }],
      }),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/chart/AAPL?");
  });
});
