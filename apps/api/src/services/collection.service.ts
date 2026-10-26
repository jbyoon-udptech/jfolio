import type {
  AssetType,
  CollectionJob,
  DataInterval,
  Instrument,
  ProviderState,
  QuoteInterval,
} from "@jfolio/shared";
import type { AppConfig } from "../config";
import { newId } from "../domain/ids";
import { quoteIntervalFromSeconds } from "../domain/intervals";
import type { MarketDataProvider } from "../providers/market-data.provider";
import type { ProviderRegistry } from "../providers/registry";
import type { Repositories } from "../repositories/types";
import { MarketDataService } from "./market-data.service";
import { SignalService } from "./signal.service";

export interface CollectionRunOptions {
  assetTypes?: AssetType[];
  instrumentIds?: string[];
}

export interface CollectionRunResult {
  jobs: CollectionJob[];
  instrumentsProcessed: number;
  inserted: number;
  duplicates: number;
  rejected: number;
  signalsTriggered: number;
  errors: string[];
}

/**
 * FR-012 / FR-014: Orchestrates one collection pass. Providers are isolated:
 * a failure for one provider never aborts collection for another (NFR-002).
 */
export class CollectionService {
  constructor(
    private readonly repos: Repositories,
    private readonly registry: ProviderRegistry,
    private readonly marketData: MarketDataService,
    private readonly signals: SignalService,
    private readonly intervals: AppConfig["collection"]["intervals"],
    private readonly now: () => Date = () => new Date(),
  ) {}

  private resolveProvider(instrument: Instrument): MarketDataProvider | undefined {
    return this.registry.forInstrument(instrument);
  }

  /**
   * Live quotes are stored with the configured collection cadence rather than
   * a provider-native interval (e.g. Binance always labels its ticker "1m").
   * ETF instruments share the stock collection schedule.
   */
  private collectionInterval(instrument: Instrument): QuoteInterval | null {
    const key = instrument.assetType === "ETF" ? "STOCK" : instrument.assetType;
    if (key !== "STOCK" && key !== "CRYPTO" && key !== "FX") return null;
    const seconds = this.intervals[key];
    return Number.isFinite(seconds) && seconds > 0 ? quoteIntervalFromSeconds(seconds) : null;
  }

  async run(options: CollectionRunOptions = {}): Promise<CollectionRunResult> {
    const result: CollectionRunResult = {
      jobs: [],
      instrumentsProcessed: 0,
      inserted: 0,
      duplicates: 0,
      rejected: 0,
      signalsTriggered: 0,
      errors: [],
    };

    let instruments = await this.repos.instruments.findActive();
    if (options.assetTypes?.length) {
      instruments = instruments.filter((i) => options.assetTypes!.includes(i.assetType));
    }
    if (options.instrumentIds?.length) {
      instruments = instruments.filter((i) => options.instrumentIds!.includes(i.instrumentId));
    }

    // Group by provider so each job / state update maps to one provider.
    const groups = new Map<string, { provider: MarketDataProvider; instruments: Instrument[] }>();
    for (const instrument of instruments) {
      const provider = this.resolveProvider(instrument);
      if (!provider) continue;
      const group = groups.get(provider.providerId) ?? { provider, instruments: [] };
      group.instruments.push(instrument);
      groups.set(provider.providerId, group);
    }

    for (const { provider, instruments: groupInstruments } of groups.values()) {
      const job = await this.startJob(provider, groupInstruments);
      const counters = { success: 0, failure: 0, lastDataTimestamp: null as Date | null };
      const errors: string[] = [];

      for (const instrument of groupInstruments) {
        result.instrumentsProcessed += 1;
        try {
          const fetched = await provider.getLatestQuote(instrument);
          if (!fetched) {
            counters.failure += 1;
            errors.push(`${instrument.symbol}: provider returned no quote`);
            continue;
          }
          const interval = this.collectionInterval(instrument);
          const quote = interval ? { ...fetched, interval } : fetched;
          const stored = await this.marketData.storeQuote(instrument, quote);
          if (stored.stored) result.inserted += 1;
          else if (stored.duplicate) result.duplicates += 1;
          else result.rejected += 1;

          if (stored.issues.some((i) => i.severity === "REJECT")) {
            counters.failure += 1;
            errors.push(`${instrument.symbol}: ${stored.issues.map((i) => i.code).join(",")}`);
            continue;
          }

          counters.success += 1;
          counters.lastDataTimestamp = quote.timestamp;

          const outcomes = await this.signals.processObservedPrice(
            instrument,
            quote.price,
            quote.timestamp,
          );
          result.signalsTriggered += outcomes.filter((o) => o.triggered).length;
        } catch (error) {
          counters.failure += 1;
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`${instrument.symbol}: ${message}`);
        }
      }

      await this.finishJob(job, counters, errors);
      await this.updateProviderState(provider, groupInstruments.length, counters, errors);
      result.errors.push(...errors);
    }

    return result;
  }

  /** FR-021: Fetch and store historical quotes for one instrument. */
  async collectHistorical(
    instrument: Instrument,
    from: Date,
    to: Date,
    interval: DataInterval,
  ): Promise<{ inserted: number; duplicates: number; rejected: number }> {
    const provider = this.resolveProvider(instrument);
    if (!provider) return { inserted: 0, duplicates: 0, rejected: 0 };
    const quotes = await provider.getHistoricalQuotes(instrument, from, to, interval);
    const summary = await this.marketData.ingest(instrument, quotes);
    return {
      inserted: summary.inserted,
      duplicates: summary.duplicates,
      rejected: summary.rejected,
    };
  }

  private async startJob(
    provider: MarketDataProvider,
    instruments: Instrument[],
  ): Promise<CollectionJob> {
    const job: CollectionJob = {
      jobId: newId("job"),
      providerId: provider.providerId,
      assetType: [...new Set(instruments.map((i) => i.assetType))].join(","),
      startedAt: this.now(),
      finishedAt: null,
      status: "RUNNING",
      targetCount: instruments.length,
      successCount: 0,
      failureCount: 0,
      error: null,
    };
    return this.repos.collectionJobs.create(job);
  }

  private async finishJob(
    job: CollectionJob,
    counters: { success: number; failure: number },
    errors: string[],
  ): Promise<void> {
    const status = counters.failure === 0 ? "SUCCESS" : counters.success === 0 ? "FAILED" : "PARTIAL";
    await this.repos.collectionJobs.update(job.jobId, {
      finishedAt: this.now(),
      status,
      successCount: counters.success,
      failureCount: counters.failure,
      error: errors.length ? errors.slice(0, 5).join("; ") : null,
    });
  }

  private async updateProviderState(
    provider: MarketDataProvider,
    targetCount: number,
    counters: { success: number; failure: number; lastDataTimestamp: Date | null },
    errors: string[],
  ): Promise<void> {
    const previous = await this.repos.providerStates.get(provider.providerId);
    const now = this.now();
    const state: ProviderState = {
      providerId: provider.providerId,
      lastRunAt: now,
      lastSuccessAt: counters.success > 0 ? now : (previous?.lastSuccessAt ?? null),
      lastErrorAt: counters.failure > 0 ? now : (previous?.lastErrorAt ?? null),
      consecutiveFailures:
        counters.success > 0 ? 0 : (previous?.consecutiveFailures ?? 0) + (counters.failure > 0 ? 1 : 0),
      lastError: errors.length ? errors.slice(0, 5).join("; ") : (previous?.lastError ?? null),
      targetCount,
      successCount: counters.success,
      failureCount: counters.failure,
      lastDataTimestamp: counters.lastDataTimestamp ?? previous?.lastDataTimestamp ?? null,
    };
    await this.repos.providerStates.upsert(state);
  }
}
