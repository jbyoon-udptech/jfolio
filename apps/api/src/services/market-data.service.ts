import type { Instrument, LatestQuote, MarketQuote } from "@jfolio/shared";
import { parseFxPair } from "../providers/market-data.provider";
import type { HistoricalQuery, Repositories } from "../repositories/types";
import { isFiniteNumber, isPositiveFinite } from "../domain/money";

export interface QuoteIssue {
  code: string;
  message: string;
  severity: "REJECT" | "FLAG";
}

export interface QuoteStoreResult {
  stored: boolean;
  duplicate: boolean;
  issues: QuoteIssue[];
}

export interface IngestSummary {
  inserted: number;
  duplicates: number;
  rejected: number;
  issues: string[];
}

/** Maximum tolerated move vs the previous quote before flagging (FR-013). */
const ABNORMAL_CHANGE_RATIO = 0.5;
/** Fallback stablecoin set when no config is supplied (see AppConfig.fx). */
const DEFAULT_STABLECOIN_PEGS: ReadonlySet<string> = new Set([
  "USDT",
  "USDC",
  "BUSD",
  "DAI",
  "TUSD",
  "FDUSD",
]);
/** Quotes dated more than this far in the future are rejected. */
const MAX_FUTURE_SKEW_MS = 10 * 60 * 1000;

/**
 * FR-013 / FR-020 / FR-021: Validate and persist normalised market quotes.
 * Invalid data is never silently turned into a valuation — it is rejected and
 * recorded. Suspicious-but-plausible data is stored and flagged.
 */
export class MarketDataService {
  constructor(
    private readonly repos: Repositories,
    private readonly now: () => Date = () => new Date(),
    /**
     * Crypto quote currencies pegged 1:1 to USD for FX resolution. Stablecoins
     * such as USDT are not fiat and no FX provider publishes them, so a
     * USDT-priced asset is converted via USD (USDT -> USD -> KRW).
     */
    private readonly stablecoinPegs: ReadonlySet<string> = DEFAULT_STABLECOIN_PEGS,
  ) {}

  validateQuote(instrument: Instrument, quote: MarketQuote): QuoteIssue[] {
    const issues: QuoteIssue[] = [];
    if (!isPositiveFinite(quote.price)) {
      issues.push({ code: "INVALID_PRICE", message: `price=${quote.price} is not a positive number`, severity: "REJECT" });
    }
    if (quote.price < 0) {
      issues.push({ code: "NEGATIVE_PRICE", message: `price=${quote.price} is negative`, severity: "REJECT" });
    }
    if (!isFiniteNumber(quote.timestamp.getTime()) || Number.isNaN(quote.timestamp.getTime())) {
      issues.push({ code: "INVALID_TIMESTAMP", message: "timestamp is not a valid date", severity: "REJECT" });
    }
    if (quote.timestamp.getTime() - this.now().getTime() > MAX_FUTURE_SKEW_MS) {
      issues.push({ code: "FUTURE_TIMESTAMP", message: "timestamp is in the future", severity: "REJECT" });
    }
    if (quote.currency && instrument.currency && quote.currency !== instrument.currency) {
      issues.push({
        code: "CURRENCY_MISMATCH",
        message: `quote currency ${quote.currency} != instrument currency ${instrument.currency}`,
        severity: "REJECT",
      });
    }
    return issues;
  }

  private async flagAbnormalChange(instrument: Instrument, quote: MarketQuote): Promise<QuoteIssue[]> {
    const previous = await this.repos.quotes.getLatest(instrument.instrumentId);
    if (!previous || !isPositiveFinite(previous.price)) return [];
    const change = Math.abs(quote.price / previous.price - 1);
    if (change > ABNORMAL_CHANGE_RATIO) {
      return [
        {
          code: "ABNORMAL_CHANGE",
          message: `price moved ${(change * 100).toFixed(1)}% from ${previous.price} to ${quote.price}`,
          severity: "FLAG",
        },
      ];
    }
    return [];
  }

  async storeQuote(instrument: Instrument, quote: MarketQuote): Promise<QuoteStoreResult> {
    const issues = this.validateQuote(instrument, quote);
    if (issues.some((i) => i.severity === "REJECT")) {
      return { stored: false, duplicate: false, issues };
    }
    const flags = await this.flagAbnormalChange(instrument, quote);
    const inserted = await this.repos.quotes.insertQuote(quote);
    if (inserted && instrument.assetType === "FX") {
      await this.persistFxRate(instrument, quote);
    }
    return { stored: inserted, duplicate: !inserted, issues: [...issues, ...flags] };
  }

  private async persistFxRate(instrument: Instrument, quote: MarketQuote): Promise<void> {
    const pair = parseFxPair(instrument.symbol);
    const base = pair?.base ?? instrument.providers[0]?.providerSymbol;
    const quoteCurrency = pair?.quote ?? instrument.currency;
    if (!base) return;
    await this.repos.fxRates.upsertRate({
      base,
      quote: quoteCurrency,
      rate: quote.price,
      timestamp: quote.timestamp,
      receivedAt: quote.receivedAt,
      providerId: quote.providerId,
      isFinal: quote.isFinal,
    });
  }

  async ingest(instrument: Instrument, quotes: MarketQuote[]): Promise<IngestSummary> {
    const summary: IngestSummary = { inserted: 0, duplicates: 0, rejected: 0, issues: [] };
    for (const quote of quotes) {
      const result = await this.storeQuote(instrument, quote);
      if (result.stored) summary.inserted += 1;
      else if (result.duplicate) summary.duplicates += 1;
      else summary.rejected += 1;
      for (const issue of result.issues) {
        summary.issues.push(`${issue.code}: ${issue.message}`);
      }
    }
    return summary;
  }

  async getLatest(instrumentId: string): Promise<LatestQuote | null> {
    return this.repos.quotes.getLatest(instrumentId);
  }

  /** Batch lookup of materialised latest quotes, keyed by instrumentId. */
  async getLatestMany(instrumentIds: string[]): Promise<Map<string, LatestQuote>> {
    return this.repos.quotes.getLatestMany(instrumentIds);
  }

  async getHistorical(instrumentId: string, query: HistoricalQuery = {}): Promise<MarketQuote[]> {
    return this.repos.quotes.getHistorical(instrumentId, query);
  }

  /**
   * FR-053: Price as of a specific time. For "now-ish" times this uses the
   * latest quote; for historical times it prefers a daily close then any quote
   * at or before the requested instant.
   */
  async getQuoteAsOf(instrumentId: string, asOf: Date): Promise<MarketQuote | null> {
    if (asOf.getTime() >= this.now().getTime() - 60_000) {
      const latest = await this.repos.quotes.getLatest(instrumentId);
      if (latest) return latest;
    }
    const inclusive = new Date(asOf.getTime() + 1);
    const daily = await this.repos.quotes.getLastBefore(instrumentId, inclusive, "1d");
    if (daily) return daily;
    return this.repos.quotes.getLastBefore(instrumentId, inclusive);
  }

  /**
   * FR-042: Resolve an FX rate from `from` to `to` as of `asOf`, trying the
   * direct pair then the inverse.
   */
  async getFxRate(from: string, to: string, asOf: Date): Promise<number | null> {
    if (from === to) return 1;
    const direct = await this.repos.fxRates.getRate(from, to, asOf);
    if (direct && isPositiveFinite(direct.rate)) return direct.rate;
    const inverse = await this.repos.fxRates.getRate(to, from, asOf);
    if (inverse && isPositiveFinite(inverse.rate)) return 1 / inverse.rate;
    return this.resolveViaStablecoinPeg(from, to, asOf);
  }

  /**
   * Documented assumption: stablecoins (USDT, USDC, ...) are treated as pegged
   * 1:1 to USD because no fiat FX provider publishes them. This lets a
   * USDT-priced crypto asset be converted to the base currency through the
   * existing USD rate without inventing a synthetic price.
   */
  private async resolveViaStablecoinPeg(
    from: string,
    to: string,
    asOf: Date,
  ): Promise<number | null> {
    const pegs = this.stablecoinPegs;
    const fromPegged = pegs.has(from);
    const toPegged = pegs.has(to);
    if (!fromPegged && !toPegged) return null;
    if (fromPegged && toPegged) return 1;
    if (fromPegged) {
      if (to === "USD") return 1;
      return this.lookupFiat("USD", to, asOf);
    }
    // toPegged
    if (from === "USD") return 1;
    return this.lookupFiat(from, "USD", asOf);
  }

  /** Direct-or-inverse lookup against stored fiat rates. */
  private async lookupFiat(base: string, quote: string, asOf: Date): Promise<number | null> {
    const direct = await this.repos.fxRates.getRate(base, quote, asOf);
    if (direct && isPositiveFinite(direct.rate)) return direct.rate;
    const inverse = await this.repos.fxRates.getRate(quote, base, asOf);
    if (inverse && isPositiveFinite(inverse.rate)) return 1 / inverse.rate;
    return null;
  }
}
