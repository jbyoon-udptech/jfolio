import type { AssetType, DataInterval, Instrument, MarketQuote } from "@jfolio/shared";
import { fetchJson } from "../http";
import { ProviderError, type MarketDataProvider, type ProviderCapabilities } from "../market-data.provider";
import { yahooSymbolCandidates } from "./yahoo-symbol";

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
            /** Yahoo's own classification, e.g. "EQUITY", "ETF", "MUTUALFUND". */
            instrumentType?: string;
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

type YahooChartWindow = { range: string } | { from: Date; to: Date };

/**
 * Yahoo instrument types accepted for an asset type when jFolio derived the
 * exchange suffix. A KOSDAQ code requested with the KOSPI `.KS` suffix can
 * resolve to an unrelated fund that shares the code (e.g. `247540.KS` is a
 * MUTUALFUND while `247540.KQ` is the EQUITY), so a mismatched candidate is
 * skipped in favour of the next board.
 */
const ACCEPTED_YAHOO_TYPES: Partial<Record<AssetType, string[]>> = {
  STOCK: ["EQUITY"],
  ETF: ["ETF", "MUTUALFUND"],
};

function typeMatches(assetType: AssetType, yahooType: string | undefined): boolean {
  // Be lenient when Yahoo omits the classification.
  if (!yahooType) return true;
  const accepted = ACCEPTED_YAHOO_TYPES[assetType];
  return accepted === undefined || accepted.includes(yahooType);
}

/**
 * Yahoo Finance chart provider (public, unofficial, no API key).
 * providerSymbol is the Yahoo ticker, e.g. "AAPL" or "005930.KS". When it is a
 * bare Korean code (market KRX/KOSPI/KOSDAQ) the exchange suffix is derived
 * automatically.
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

  private async fetchChart(
    symbol: string,
    window: YahooChartWindow,
    interval: string,
  ): Promise<NonNullable<YahooChartResponse["chart"]["result"]>[number]> {
    const query =
      "range" in window
        ? `range=${window.range}&interval=${interval}`
        : `period1=${Math.floor(window.from.getTime() / 1000)}` +
          `&period2=${Math.ceil(window.to.getTime() / 1000)}` +
          `&interval=${interval}`;
    const url =
      `${this.baseUrl}/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?${query}`;
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

  private async request(
    instrument: Instrument,
    window: YahooChartWindow,
    interval: string,
  ): Promise<NonNullable<YahooChartResponse["chart"]["result"]>[number]> {
    const link = instrument.providers.find((p) => p.providerId === this.providerId);
    const raw = link?.providerSymbol?.trim() || instrument.symbol;
    const candidates = yahooSymbolCandidates(raw, instrument.market);
    if (candidates.length === 0) {
      throw new ProviderError(`No Yahoo symbol for ${instrument.symbol}`, this.providerId, false);
    }
    // Try each candidate in order. The first that resolves to a plausible
    // instrument wins; the last error is surfaced when none do. A suffix jFolio
    // derived (not supplied by the user) is validated so a KOSDAQ code is not
    // silently read from the KOSPI fund that happens to share its code.
    let lastError: unknown;
    for (const symbol of candidates) {
      try {
        const result = await this.fetchChart(symbol, window, interval);
        if (symbol !== raw && !typeMatches(instrument.assetType, result.meta.instrumentType)) {
          lastError = new ProviderError(
            `Yahoo ${symbol} is ${result.meta.instrumentType ?? "unknown"}, not ${instrument.assetType}`,
            this.providerId,
            false,
          );
          continue;
        }
        return result;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new ProviderError(
          `Yahoo request failed for ${instrument.symbol}`,
          this.providerId,
          false,
        );
  }

  async getLatestQuote(instrument: Instrument): Promise<MarketQuote | null> {
    const result = await this.request(instrument, { range: "1d" }, "1m");
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
    // Yahoo's range=1d for daily bars returns only the current/partial session.
    // A week of daily bars guarantees the requested completed day is present
    // even when another market has already opened (e.g. KRX at UTC midnight).
    const effectiveRange = interval === "1d" && range === "1d" ? "7d" : range;
    // Yahoo caps `range=1y`, which silently truncated long backfills. Ask for
    // an explicit Unix-second window whenever the requested span is longer
    // than the largest named range.
    const window: YahooChartWindow =
      spanDays > 60 ? { from, to } : { range: effectiveRange };
    const result = await this.request(instrument, window, yahooInterval);
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
