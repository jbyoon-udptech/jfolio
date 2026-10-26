import type { AssetType, DataInterval, Instrument } from "@jfolio/shared";
import type { ProviderRegistry } from "../providers/registry";
import type { Repositories } from "../repositories/types";
import type { CollectionService } from "./collection.service";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface BackfillOptions {
  from?: Date;
  to?: Date;
  /** Explicit lookback. When omitted, start at the first transaction. */
  days?: number;
  interval?: DataInterval;
  assetTypes?: AssetType[];
  instrumentIds?: string[];
}

export type BackfillStatus = "OK" | "SKIPPED" | "ERROR";

export interface InstrumentBackfillResult {
  instrumentId: string;
  symbol: string;
  assetType: AssetType;
  providerId: string | null;
  from: string | null;
  to: string | null;
  interval: DataInterval;
  status: BackfillStatus;
  message: string | null;
  inserted: number;
  duplicates: number;
  rejected: number;
}

export interface BackfillRunResult {
  instrumentsProcessed: number;
  succeeded: number;
  skipped: number;
  failed: number;
  inserted: number;
  duplicates: number;
  rejected: number;
  results: InstrumentBackfillResult[];
}

/**
 * Fills in daily price/FX history after the fact. Live collection only stores
 * the latest quote, so a newly added instrument has no past observations and
 * the dashboard's valuation history would otherwise be `UNAVAILABLE`. This
 * service is deliberately provider-bound only: it never gets called from
 * dashboard reads.
 */
export class HistoricalBackfillService {
  private readonly pending = new Set<Promise<InstrumentBackfillResult>>();

  constructor(
    private readonly repos: Repositories,
    private readonly providers: ProviderRegistry,
    private readonly collection: CollectionService,
    private readonly defaultDays: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Start a background backfill and return a promise tests can await. */
  enqueue(
    instrument: Instrument,
    options: BackfillOptions = {},
  ): Promise<InstrumentBackfillResult> {
    const task = this.backfillInstrument(instrument, options);
    this.pending.add(task);
    // Attach a rejection handler so a caller that intentionally does not await
    // (the asset creation route) can never produce an unhandled rejection.
    void task.catch(() => undefined).finally(() => this.pending.delete(task));
    return task;
  }

  /** Wait until all enqueued background jobs have settled. */
  async waitForIdle(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.allSettled([...this.pending]);
    }
  }

  async backfillAll(options: BackfillOptions = {}): Promise<BackfillRunResult> {
    const instruments = await this.selectInstruments(options);
    const results: InstrumentBackfillResult[] = [];
    for (const instrument of instruments) {
      try {
        results.push(await this.backfillInstrument(instrument, options));
      } catch (error) {
        results.push({
          ...this.baseResult(instrument, options),
          status: "ERROR",
          message: errorMessage(error),
        });
      }
    }
    return summarize(results);
  }

  async backfillInstrument(
    instrument: Instrument,
    options: BackfillOptions = {},
  ): Promise<InstrumentBackfillResult> {
    const result = this.baseResult(instrument, options);
    const provider = this.providers.forInstrument(instrument);
    if (!provider) {
      return { ...result, message: "no market data provider" };
    }
    result.providerId = provider.providerId;
    if (!provider.capabilities.historical) {
      return {
        ...result,
        message: `provider ${provider.providerId} does not support historical data`,
      };
    }
    if (!provider.capabilities.intervals.includes(result.interval)) {
      return {
        ...result,
        message: `provider ${provider.providerId} does not support interval ${result.interval}`,
      };
    }

    try {
      const from = await this.resolveFrom(instrument, options);
      const to = options.to ?? this.now();
      if (!isValidDate(from) || !isValidDate(to)) {
        return { ...result, message: "invalid backfill range" };
      }
      result.from = from.toISOString();
      result.to = to.toISOString();
      if (from.getTime() >= to.getTime()) {
        return { ...result, message: "from must be before to" };
      }

      const summary = await this.collection.collectHistorical(
        instrument,
        from,
        to,
        result.interval,
      );
      return { ...result, status: "OK", ...summary };
    } catch (error) {
      return { ...result, status: "ERROR", message: errorMessage(error) };
    }
  }

  private async selectInstruments(options: BackfillOptions): Promise<Instrument[]> {
    let instruments = await this.repos.instruments.findActive();
    if (options.assetTypes?.length) {
      const allowed = new Set(options.assetTypes);
      instruments = instruments.filter((instrument) => allowed.has(instrument.assetType));
    }
    if (options.instrumentIds?.length) {
      const allowed = new Set(options.instrumentIds);
      instruments = instruments.filter((instrument) => allowed.has(instrument.instrumentId));
    }
    return instruments.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  private async resolveFrom(instrument: Instrument, options: BackfillOptions): Promise<Date> {
    if (options.from) return options.from;
    if (options.days !== undefined) return this.lookbackStart(options.days);

    // Start one day before the first trade so the valuation at that timestamp
    // can use the previous daily close. If the instrument has no ledger yet,
    // use the configured fallback window (the chart's "ALL" range is 365d).
    const earliest = await this.repos.transactions.list({
      instrumentId: instrument.instrumentId,
      limit: 1,
    });
    const first = earliest.items[0];
    if (first) return new Date(first.timestamp.getTime() - DAY_MS);
    return this.lookbackStart(this.defaultDays);
  }

  private lookbackStart(days: number): Date {
    const from = new Date(
      this.now().getTime() - Math.max(1, Math.floor(days)) * DAY_MS,
    );
    from.setUTCHours(0, 0, 0, 0);
    return from;
  }

  private baseResult(
    instrument: Instrument,
    options: BackfillOptions,
  ): InstrumentBackfillResult {
    return {
      instrumentId: instrument.instrumentId,
      symbol: instrument.symbol,
      assetType: instrument.assetType,
      providerId: null,
      from: isoOrNull(options.from),
      to: isoOrNull(options.to),
      interval: options.interval ?? "1d",
      status: "SKIPPED",
      message: null,
      inserted: 0,
      duplicates: 0,
      rejected: 0,
    };
  }
}

function summarize(results: InstrumentBackfillResult[]): BackfillRunResult {
  const summary: BackfillRunResult = {
    instrumentsProcessed: results.length,
    succeeded: 0,
    skipped: 0,
    failed: 0,
    inserted: 0,
    duplicates: 0,
    rejected: 0,
    results,
  };
  for (const result of results) {
    if (result.status === "OK") summary.succeeded += 1;
    else if (result.status === "SKIPPED") summary.skipped += 1;
    else summary.failed += 1;
    summary.inserted += result.inserted;
    summary.duplicates += result.duplicates;
    summary.rejected += result.rejected;
  }
  return summary;
}

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

function isoOrNull(value: Date | undefined): string | null {
  return value && isValidDate(value) ? value.toISOString() : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
