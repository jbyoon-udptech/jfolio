import type { AssetType, DataInterval, Instrument, MarketQuote } from "@jfolio/shared";
import { fetchJson } from "../http";
import { ProviderError, type MarketDataProvider, type ProviderCapabilities } from "../market-data.provider";

interface YahooChartResponse {
  chart: {
    result:
      | Array<{
          meta: {
            currency: string;
            symbol: string;
            regularMarketPrice?: number;
            regularMarketTime?: number;
            previousClose?: number;
          };
          timestamp?: number[];
          indicators: {
            quote: Array<{
              open?: (number | null)[];
              high?: (number | null)[];
              low?: (number | null)[];
              close?: (number | null)[];
              volume?: (number | null)[];
            }>;
          };
        }>
      | null;
    error: unknown;
  };
}

const YAHOO_INTERVALS: Partial<Record<DataInterval, string>> = {
  "1m": "1m",
  "5m": "5m",
  "1h": "60m",
  "1d": "1d",
};

const DAY_MS = 86_400_000;

/**
 * Yahoo Finance chart provider (public, unofficial, no API key).
 * providerSymbol is the Yahoo ticker, e.g. "AAPL" or "005930.KS".
 */
export class YahooStockProvider implements MarketDataProvider {
  readonly providerId = "yahoo";
  readonly displayName = "Yahoo Finance Chart (public, unofficial)";
  readonly assetTypes: AssetType[] = ["STOCK", "ETF"];
  readonly capabilities: ProviderCapabilities = {
    latest: true,
    historical: true,
    intervals: ["1m", "5m", "1h", "1d"],
    requiresCredentials: false,
  };

  constructor(
    private readonly baseUrl = "https://query1.finance.yahoo.com",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private providerSymbol(instrument: Instrument): string {
    const link = instrument.providers.find((p) => p.providerId === this.providerId);
    return link?.providerSymbol ?? instrument.symbol;
  }

  private async request(
    instrument: Instrument,
    range: string,
    interval: string,
  ): Promise<NonNullable<YahooChartResponse["chart"]["result"]>[number]> {
    const symbol = this.providerSymbol(instrument);
    const url =
      `${this.baseUrl}/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?range=${range}&interval=${interval}`;
    const data = await fetchJson<YahooChartResponse>(url, {
      fetchImpl: this.fetchImpl,
      headers: { "user-agent": "Mozilla/5.0 (compatible; jFolio/0.1)" },
    });
    const result = data.chart.result?.[0];
    if (!result) {
      throw new ProviderError(`Yahoo returned no result for ${symbol}`, this.providerId, false);
    }
    return result;
  }

  async getLatestQuote(instrument: Instrument): Promise<MarketQuote | null> {
    const result = await this.request(instrument, "1d", "1m");
    const price = result.meta.regularMarketPrice;
    if (price === undefined || !Number.isFinite(price) || price <= 0) {
      return null;
    }
    const asOf = result.meta.regularMarketTime
      ? new Date(result.meta.regularMarketTime * 1000)
      : new Date();
    return {
      instrumentId: instrument.instrumentId,
      providerId: this.providerId,
      interval: "1m",
      timestamp: asOf,
      receivedAt: new Date(),
      price,
      currency: result.meta.currency ?? instrument.currency,
      close: price,
      isFinal: false,
    };
  }

  async getHistoricalQuotes(
    instrument: Instrument,
    from: Date,
    to: Date,
    interval: DataInterval,
  ): Promise<MarketQuote[]> {
    const yahooInterval = YAHOO_INTERVALS[interval];
    if (!yahooInterval) {
      throw new ProviderError(`Yahoo does not support interval ${interval}`, this.providerId, false);
    }
    const spanDays = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / DAY_MS));
    const range = spanDays <= 1 ? "1d" : spanDays <= 7 ? "7d" : spanDays <= 60 ? "60d" : "1y";
    const result = await this.request(instrument, range, yahooInterval);
    const timestamps = result.timestamp ?? [];
    const quote = result.indicators.quote[0];
    if (!quote) return [];
    const receivedAt = new Date();
    const quotes: MarketQuote[] = [];
    for (let i = 0; i < timestamps.length; i += 1) {
      const ts = timestamps[i];
      const close = quote.close?.[i];
      if (ts === undefined || close === null || close === undefined) continue;
      const at = new Date(ts * 1000);
      if (at < from || at > to) continue;
      quotes.push({
        instrumentId: instrument.instrumentId,
        providerId: this.providerId,
        interval,
        timestamp: at,
        receivedAt,
        price: close,
        currency: result.meta.currency ?? instrument.currency,
        open: quote.open?.[i] ?? undefined,
        high: quote.high?.[i] ?? undefined,
        low: quote.low?.[i] ?? undefined,
        close,
        volume: quote.volume?.[i] ?? undefined,
        isFinal: true,
      });
    }
    return quotes;
  }
}
