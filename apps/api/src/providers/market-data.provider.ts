import type { AssetType, DataInterval, Instrument, MarketQuote } from "@jfolio/shared";

/**
 * FR-010: Capability declaration so callers can gracefully handle providers
 * that cannot serve certain data (e.g. no intraday history).
 */
export interface ProviderCapabilities {
  latest: boolean;
  historical: boolean;
  /** Intervals this provider can actually return. */
  intervals: DataInterval[];
  /** Whether an API key / paid plan is required. */
  requiresCredentials: boolean;
}

/**
 * FR-010 / FR-011: The single interface every external market data source
 * implements. Implementations must never leak provider-specific response shapes
 * beyond this boundary.
 */
export interface MarketDataProvider {
  readonly providerId: string;
  readonly displayName: string;
  readonly assetTypes: AssetType[];
  readonly capabilities: ProviderCapabilities;

  /** Latest available quote, or null when the provider has no data. */
  getLatestQuote(instrument: Instrument): Promise<MarketQuote | null>;

  /** Historical quotes in [from, to]. Empty array when unsupported. */
  getHistoricalQuotes(
    instrument: Instrument,
    from: Date,
    to: Date,
    interval: DataInterval,
  ): Promise<MarketQuote[]>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly providerId: string,
    readonly retryable: boolean,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Parse "USD/KRW" style FX symbols into base/quote currencies. */
export function parseFxPair(symbol: string): { base: string; quote: string } | null {
  const parts = symbol.split("/");
  if (parts.length !== 2) return null;
  const [base, quote] = parts;
  if (!base || !quote) return null;
  return { base: base.toUpperCase(), quote: quote.toUpperCase() };
}
