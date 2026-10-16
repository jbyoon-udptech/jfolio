import type { AssetType, DataInterval, Instrument, MarketQuote } from "@jfolio/shared";
import { fetchJson } from "../http";
import {
  ProviderError,
  parseFxPair,
  type MarketDataProvider,
  type ProviderCapabilities,
} from "../market-data.provider";

interface FrankfurterLatest {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

interface FrankfurterRange {
  amount: number;
  base: string;
  start_date: string;
  end_date: string;
  rates: Record<string, Record<string, number>>;
}

/**
 * Frankfurter provider backed by the European Central Bank reference rates
 * (public, no API key). Daily granularity only.
 *
 * FX instruments use the symbol convention "BASE/QUOTE" (e.g. "USD/KRW") and
 * providerSymbol = BASE currency (e.g. "USD").
 */
export class FrankfurterFxProvider implements MarketDataProvider {
  readonly providerId = "frankfurter";
  readonly displayName = "Frankfurter / ECB reference rates (public)";
  readonly assetTypes: AssetType[] = ["FX"];
  readonly capabilities: ProviderCapabilities = {
    latest: true,
    historical: true,
    intervals: ["1d"],
    requiresCredentials: false,
  };

  constructor(
    private readonly baseUrl = "https://api.frankfurter.dev",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private resolvePair(instrument: Instrument): { base: string; quote: string } {
    const link = instrument.providers.find((p) => p.providerId === this.providerId);
    // `providerSymbol` is documented as the base currency (e.g. "USD"), but be
    // tolerant of callers that store the full pair (e.g. "USD/KRW").
    const linkBase = link?.providerSymbol?.includes("/")
      ? parseFxPair(link.providerSymbol)?.base
      : link?.providerSymbol;
    const base = linkBase ?? parseFxPair(instrument.symbol)?.base;
    const quote = parseFxPair(instrument.symbol)?.quote ?? instrument.currency;
    if (!base || !quote) {
      throw new ProviderError(
        `Cannot resolve FX pair for instrument ${instrument.symbol}`,
        this.providerId,
        false,
      );
    }
    return { base, quote };
  }

  async getLatestQuote(instrument: Instrument): Promise<MarketQuote | null> {
    const { base, quote } = this.resolvePair(instrument);
    const url = `${this.baseUrl}/v1/latest?base=${base}&symbols=${quote}`;
    const data = await fetchJson<FrankfurterLatest>(url, { fetchImpl: this.fetchImpl });
    const rate = data.rates[quote];
    if (rate === undefined || !Number.isFinite(rate) || rate <= 0) return null;
    const asOf = new Date(`${data.date}T00:00:00.000Z`);
    return {
      instrumentId: instrument.instrumentId,
      providerId: this.providerId,
      interval: "1d",
      timestamp: asOf,
      receivedAt: new Date(),
      price: rate,
      currency: quote,
      close: rate,
      isFinal: true,
    };
  }

  async getHistoricalQuotes(
    instrument: Instrument,
    from: Date,
    to: Date,
    interval: DataInterval,
  ): Promise<MarketQuote[]> {
    if (interval !== "1d") {
      throw new ProviderError(
        `Frankfurter only supports daily interval, got ${interval}`,
        this.providerId,
        false,
      );
    }
    const { base, quote } = this.resolvePair(instrument);
    const start = from.toISOString().slice(0, 10);
    const end = to.toISOString().slice(0, 10);
    const url = `${this.baseUrl}/v1/${start}..${end}?base=${base}&symbols=${quote}`;
    const data = await fetchJson<FrankfurterRange>(url, { fetchImpl: this.fetchImpl });
    const receivedAt = new Date();
    return Object.entries(data.rates)
      .map(([date, rates]): MarketQuote | null => {
        const rate = rates[quote];
        if (rate === undefined || !Number.isFinite(rate) || rate <= 0) return null;
        return {
          instrumentId: instrument.instrumentId,
          providerId: this.providerId,
          interval: "1d",
          timestamp: new Date(`${date}T00:00:00.000Z`),
          receivedAt,
          price: rate,
          currency: quote,
          close: rate,
          isFinal: true,
        };
      })
      .filter((q): q is MarketQuote => q !== null)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
}
