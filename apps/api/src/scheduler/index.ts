import type { AssetType, PortfolioSnapshot, SnapshotType } from "@jfolio/shared";
import type { AppConfig } from "../config";
import { COLLECTION_SCHEDULES, type CollectionSchedule } from "../domain/intervals";
import type { CollectionRunOptions, CollectionRunResult } from "../services/collection.service";
import type { Container } from "../container";
import { msUntilNext, startOfDayInTimeZone, startOfHour } from "./time";

export interface SchedulerHandle {
  /** Stop all timers. Safe to call multiple times. */
  stop(): void;
  /** Run one collection pass immediately (used by the manual API and CLI). */
  runCollection(options?: CollectionRunOptions): Promise<CollectionRunResult>;
  /** Create snapshots for every portfolio at the given type + boundary. */
  runSnapshots(type: SnapshotType, asOf?: Date): Promise<PortfolioSnapshot[]>;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * FR-012 / FR-051: Periodic collection and snapshot scheduling. Collection runs
 * per schedule group (stocks and ETFs share the stock cadence so crypto can run
 * every few seconds while equities run hourly); snapshots align to hour /
 * local-day boundaries.
 */
export function startScheduler(container: Container, config: AppConfig): SchedulerHandle {
  const timers: NodeJS.Timeout[] = [];
  // Runs are tracked per asset type: timers with the same interval (e.g. all
  // 600s) fire at the same instant, and a shared flag would let the first one
  // win while silently dropping the others. A slow tick of the same type is
  // still skipped so jobs cannot stack up.
  const runningAssetTypes = new Set<AssetType>();
  // Full runs and instrument-scoped runs touch arbitrary instruments, so they
  // conflict with every other run.
  let exclusiveRunning = false;

  const runCollection = async (options?: CollectionRunOptions): Promise<CollectionRunResult> => {
    const claimed = [...new Set(options?.assetTypes ?? [])];
    const exclusive = !claimed.length || Boolean(options?.instrumentIds?.length);
    const blocked = exclusive
      ? exclusiveRunning || runningAssetTypes.size > 0
      : exclusiveRunning || claimed.some((assetType) => runningAssetTypes.has(assetType));
    if (blocked) {
      // Skip overlapping runs; a slow provider must not stack up jobs.
      return {
        jobs: [],
        instrumentsProcessed: 0,
        inserted: 0,
        duplicates: 0,
        rejected: 0,
        signalsTriggered: 0,
        errors: ["collection already running"],
      };
    }
    if (exclusive) exclusiveRunning = true;
    else for (const assetType of claimed) runningAssetTypes.add(assetType);
    try {
      return await container.collection.run(options);
    } finally {
      if (exclusive) exclusiveRunning = false;
      else for (const assetType of claimed) runningAssetTypes.delete(assetType);
    }
  };

  const runSnapshots = async (
    type: SnapshotType,
    asOf?: Date,
  ): Promise<PortfolioSnapshot[]> => {
    const portfolios = await container.portfolios.list();
    const results: PortfolioSnapshot[] = [];
    for (const portfolio of portfolios) {
      try {
        const snapshot = await container.snapshots.createSnapshot({
          portfolioId: portfolio.portfolioId,
          snapshotType: type,
          asOf,
          baseCurrency: portfolio.baseCurrency,
        });
        results.push(snapshot);
      } catch (error) {
        // A single portfolio failure must not abort the scheduled batch.
        // eslint-disable-next-line no-console
        console.error(`[scheduler] snapshot failed for ${portfolio.portfolioId}:`, error);
      }
    }
    return results;
  };

  if (config.collection.schedulerEnabled) {
    const schedules: CollectionSchedule[] = ["STOCK", "CRYPTO", "FX"];
    for (const schedule of schedules) {
      const seconds = config.collection.intervals[schedule];
      if (!seconds || seconds <= 0) continue;
      // STOCK and ETF share one run so the stock provider sees a single job and
      // both asset types are claimed by the overlap guard.
      const assetTypes: AssetType[] = [...COLLECTION_SCHEDULES[schedule]];
      const timer = setInterval(() => {
        void runCollection({ assetTypes });
      }, seconds * 1000);
      timer.unref?.();
      timers.push(timer);
    }
  }

  if (config.snapshot.hourlyEnabled) {
    scheduleAligned(
      timers,
      (from) => msUntilNext(startOfHour, from, HOUR_MS),
      () => runSnapshots("INTRADAY", startOfHour(new Date())),
    );
  }

  if (config.snapshot.dailyEnabled) {
    const timeZone = config.timezone;
    const dailyBoundary = (date: Date) => startOfDayInTimeZone(date, timeZone);
    const dayMs = 24 * HOUR_MS;
    scheduleAligned(
      timers,
      (from) => msUntilNext(dailyBoundary, from, dayMs),
      () => runSnapshots("DAILY", dailyBoundary(new Date())),
    );
  }

  return {
    stop: () => {
      for (const timer of timers) clearTimeout(timer);
      timers.length = 0;
    },
    runCollection,
    runSnapshots,
  };
}

/**
 * Run `task` at each aligned boundary. Uses a self-rescheduling timeout so the
 * delay is recomputed every cycle (robust to clock drift and long tasks).
 */
function scheduleAligned(
  timers: NodeJS.Timeout[],
  delayFor: (from: Date) => number,
  task: () => Promise<unknown>,
): void {
  const tick = () => {
    const delay = delayFor(new Date());
    const timer = setTimeout(() => {
      void Promise.resolve(task())
        .catch((error) => {
          // eslint-disable-next-line no-console
          console.error("[scheduler] scheduled task failed:", error);
        })
        .finally(tick);
    }, delay);
    timer.unref?.();
    timers.push(timer);
  };
  tick();
}
