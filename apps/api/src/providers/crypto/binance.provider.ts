import type { AssetType, DataInterval, Instrument, MarketQuote } from "@jfolio/shared";
import { fetchJson } from "../http";
import { ProviderError, type MarketDataProvider, type ProviderCapabilities } from "../market-data.provider";

interface BinanceTickerPrice {
  symbol: string;
  price: string;
}

/** Binance kline: [openTime, open, high, low, close, volume, closeTime, ...] */
type BinanceKline = [number, string, string, string, string, string, number, ...unknown[]];

const BINANCE_INTERVALS: Partial<Record<DataInterval, string>> = {
  "1m": "1m",
  "5m": "5m",
  "1h": "1h",
  "1d": "1d",
};

/**
 * Real, public Binance spot provider (no API key required).
 * providerSymbol is the Binance pair, e.g. "BTCUSDT".
 */
export class BinanceCryptoProvider implements MarketDataProvider {
  readonly providerId = "binance";
  readonly displayName = "Binance Spot (public REST)";
  readonly assetTypes: AssetType[] = ["CRYPTO"];
  readonly capabilities: ProviderCapabilities = {
    latest: true,
    historical: true,
    intervals: ["1m", "5m", "1h", "1d"],
    requiresCredentials: false,
  };

  constructor(
    private readonly baseUrl = "https://api.binance.com",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private providerSymbol(instrument: Instrument): string {
    const link = instrument.providers.find((p) => p.providerId === this.providerId);
    return link?.providerSymbol ?? instrument.symbol;
  }

  async getLatestQuote(instrument: Instrument): Promise<MarketQuote | null> {
    const symbol = this.providerSymbol(instrument);
    const url = `${this.baseUrl}/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`;
    try {
      const data = await fetchJson<BinanceTickerPrice>(url, { fetchImpl: this.fetchImpl });
      const price = Number(data.price);
      if (!Number.isFinite(price) || price <= 0) {
        throw new ProviderError(`Binance returned invalid price for ${symbol}`, this.providerId, false);
      }
      const now = new Date();
      return {
        instrumentId: instrument.instrumentId,
        providerId: this.providerId,
        interval: "1m",
        timestamp: now,
        receivedAt: now,
        price,
        currency: instrument.currency,
        isFinal: false,
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(`Binance latest quote failed: ${String(error)}`, this.providerId, true, error);
    }
  }

  async getHistoricalQuotes(
    instrument: Instrument,
    from: Date,
    to: Date,
    interval: DataInterval,
  ): Promise<MarketQuote[]> {
    const binanceInterval = BINANCE_INTERVALS[interval];
    if (!binanceInterval) {
      throw new ProviderError(
        `Binance does not support interval ${interval}`,
        this.providerId,
        false,
      );
    }
    const symbol = this.providerSymbol(instrument);
    const url =
      `${this.baseUrl}/api/v3/klines?symbol=${encodeURIComponent(symbol)}` +
      `&interval=${binanceInterval}` +
      `&startTime=${from.getTime()}&endTime=${to.getTime()}&limit=1000`;
    const data = await fetchJson<BinanceKline[]>(url, { fetchImpl: this.fetchImpl });
    const receivedAt = new Date();
    return data.map((k) => {
      const [openTime, open, high, low, close, volume] = k;
      const price = Number(close);
      return {
        instrumentId: instrument.instrumentId,
        providerId: this.providerId,
        interval,
        timestamp: new Date(openTime),
        receivedAt,
        price,
        currency: instrument.currency,
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: price,
        volume: Number(volume),
        isFinal: true,
      } satisfies MarketQuote;
    });
  }
}
