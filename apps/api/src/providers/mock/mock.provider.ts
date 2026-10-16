import type { AssetType, DataInterval, Instrument, MarketQuote } from "@jfolio/shared";
import { floorToInterval, hashString, intervalToMs } from "../../domain/intervals";
import type { MarketDataProvider, ProviderCapabilities } from "../market-data.provider";

/**
 * Deterministic synthetic provider used for offline development, demos and
 * tests. It is clearly NOT a real market data source — the providerId is
 * `mock` and every quote carries that id so it can never be mistaken for live
 * data.
 */
export interface MockProviderOptions {
  providerId?: string;
  seedPrices?: Record<string, number>;
  /** Annualised-ish volatility applied to the sine wave. Default 0.03. */
  volatility?: number;
  now?: () => Date;
}

const DEFAULT_SEED_PRICES: Record<string, number> = {
  "005930": 75000,
  AAPL: 250,
  MSFT: 420,
  BTCUSDT: 82000,
  ETHUSDT: 3100,
  "USD/KRW": 1345,
  "JPY/KRW": 8.9,
};

export class MockMarketDataProvider implements MarketDataProvider {
  readonly providerId: string;
  readonly displayName = "Mock Provider (synthetic, deterministic)";
  readonly assetTypes: AssetType[] = ["STOCK", "ETF", "CRYPTO", "FX", "CASH"];
  readonly capabilities: ProviderCapabilities = {
    latest: true,
    historical: true,
    intervals: ["10s", "1m", "5m", "1h", "1d"],
    requiresCredentials: false,
  };

  private readonly seedPrices: Record<string, number>;
  private readonly volatility: number;
  private readonly now: () => Date;

  constructor(options: MockProviderOptions = {}) {
    this.providerId = options.providerId ?? "mock";
    this.seedPrices = { ...DEFAULT_SEED_PRICES, ...options.seedPrices };
    this.volatility = options.volatility ?? 0.03;
    this.now = options.now ?? (() => new Date());
  }

  private basePrice(instrument: Instrument): number {
    const seeded = this.seedPrices[instrument.symbol];
    if (seeded !== undefined) return seeded;
    // Derive a stable pseudo price from the symbol so unknown instruments still
    // produce deterministic data.
    return 10 + (hashString(instrument.symbol) % 50_000) / 100;
  }

  /** Price at a given time: a smooth deterministic wave around the base price. */
  private priceAt(instrument: Instrument, at: Date): number {
    const base = this.basePrice(instrument);
    const periodMs = 15 * 60 * 1000; // 15 minute cycle
    const phase = (hashString(instrument.symbol) % 360) * (Math.PI / 180);
    const wave = Math.sin((at.getTime() / periodMs) * 2 * Math.PI + phase);
    const price = base * (1 + this.volatility * wave);
    return Math.round(price * 10000) / 10000;
  }

  private toQuote(
    instrument: Instrument,
    at: Date,
    interval: DataInterval,
  ): MarketQuote {
    const price = this.priceAt(instrument, at);
    const receivedAt = this.now();
    const open = this.priceAt(instrument, new Date(at.getTime()));
    const next = this.priceAt(instrument, new Date(at.getTime() + intervalToMs(interval)));
    return {
      instrumentId: instrument.instrumentId,
      providerId: this.providerId,
      interval,
      timestamp: at,
      receivedAt,
      price,
      currency: instrument.currency,
      open,
      high: Math.max(open, price, next),
      low: Math.min(open, price, next),
      close: price,
      volume: 1000 + (hashString(instrument.symbol) % 9000),
      isFinal: interval === "1d",
    };
  }

  async getLatestQuote(instrument: Instrument): Promise<MarketQuote> {
    const at = floorToInterval(this.now(), "1m");
    return this.toQuote(instrument, at, "1m");
  }

  async getHistoricalQuotes(
    instrument: Instrument,
    from: Date,
    to: Date,
    interval: DataInterval,
  ): Promise<MarketQuote[]> {
    const stepMs = intervalToMs(interval);
    const quotes: MarketQuote[] = [];
    let cursor = floorToInterval(from, interval).getTime();
    const end = to.getTime();
    let guard = 0;
    while (cursor <= end && guard < 100_000) {
      quotes.push(this.toQuote(instrument, new Date(cursor), interval));
      cursor += stepMs;
      guard += 1;
    }
    return quotes;
  }
}
