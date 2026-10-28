import { afterEach, describe, expect, it, vi } from "vitest";
import type { Container } from "../src/container";
import { startScheduler } from "../src/scheduler";
import type {
  CollectionRunOptions,
  CollectionRunResult,
} from "../src/services/collection.service";
import type { BackfillRunResult } from "../src/services/historical-backfill.service";
import { createTestConfig } from "./helpers";

function emptyResult(): CollectionRunResult {
  return {
    jobs: [],
    instrumentsProcessed: 0,
    inserted: 0,
    duplicates: 0,
    rejected: 0,
    signalsTriggered: 0,
    errors: [],
  };
}

function emptyBackfillResult(): BackfillRunResult {
  return {
    instrumentsProcessed: 0,
    succeeded: 0,
    skipped: 0,
    failed: 0,
    inserted: 0,
    duplicates: 0,
    rejected: 0,
    results: [],
  };
}

/** Scheduler wired to fake collection/backfill services. */
function createScheduler(
  overrides: NodeJS.ProcessEnv = {},
  {
    gated = true,
    catchUpDailyQuotes,
  }: { gated?: boolean; catchUpDailyQuotes?: boolean } = {},
) {
  const config = createTestConfig({
    COLLECTION_SCHEDULER_ENABLED: "false",
    HOURLY_SNAPSHOT_ENABLED: "false",
    DAILY_SNAPSHOT_ENABLED: "false",
    ...overrides,
  });
  const runs: string[] = [];
  const dailyBackfills: string[] = [];
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const container = {
    collection: {
      run: async (options?: CollectionRunOptions) => {
        runs.push((options?.assetTypes ?? ["ALL"]).join(","));
        if (gated) await gate;
        return emptyResult();
      },
    },
    backfill: {
      backfillIncrementalDaily: async () => {
        dailyBackfills.push("run");
        return emptyBackfillResult();
      },
    },
  } as unknown as Container;

  return {
    scheduler: startScheduler(container, config, { catchUpDailyQuotes }),
    runs,
    release,
    dailyBackfills,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("collection scheduler", () => {
  it("runs different asset types concurrently when their timers collide", async () => {
    const { scheduler, runs, release } = createScheduler();

    const stock = scheduler.runCollection({ assetTypes: ["STOCK"] });
    const crypto = scheduler.runCollection({ assetTypes: ["CRYPTO"] });
    const fx = scheduler.runCollection({ assetTypes: ["FX"] });

    // None of the three ticks was dropped by the others.
    expect(runs).toEqual(["STOCK", "CRYPTO", "FX"]);

    release();
    const results = await Promise.all([stock, crypto, fx]);
    expect(results.map((result) => result.errors)).toEqual([[], [], []]);

    scheduler.stop();
  });

  it("skips an overlapping run of the same asset type", async () => {
    const { scheduler, runs, release } = createScheduler();

    const first = scheduler.runCollection({ assetTypes: ["STOCK"] });
    const skipped = await scheduler.runCollection({ assetTypes: ["STOCK"] });
    expect(skipped.errors).toEqual(["collection already running"]);
    expect(runs).toEqual(["STOCK"]);

    release();
    await first;

    // Once the first run finishes the type is free again.
    const again = scheduler.runCollection({ assetTypes: ["STOCK"] });
    expect(runs).toEqual(["STOCK", "STOCK"]);
    await again;

    scheduler.stop();
  });

  it("keeps full and instrument-scoped runs exclusive", async () => {
    const { scheduler, runs, release } = createScheduler();

    const full = scheduler.runCollection();
    const typed = await scheduler.runCollection({ assetTypes: ["STOCK"] });
    expect(typed.errors).toEqual(["collection already running"]);
    expect(runs).toEqual(["ALL"]);

    release();
    await full;

    const typedAgain = scheduler.runCollection({ assetTypes: ["STOCK"] });
    const fullAgain = await scheduler.runCollection();
    expect(fullAgain.errors).toEqual(["collection already running"]);
    expect(runs).toEqual(["ALL", "STOCK"]);

    await typedAgain;
    scheduler.stop();
  });

  it("allows the same asset type again after a run completes", async () => {
    const { scheduler, runs, release } = createScheduler();

    const first = scheduler.runCollection({ assetTypes: ["CRYPTO"] });
    release();
    await first;

    const second = scheduler.runCollection({ assetTypes: ["CRYPTO"] });
    await second;
    expect(runs).toEqual(["CRYPTO", "CRYPTO"]);

    scheduler.stop();
  });

  it("refreshes ETFs together with stocks on the stock cadence", async () => {
    vi.useFakeTimers();
    const { scheduler, runs } = createScheduler(
      {
        COLLECTION_SCHEDULER_ENABLED: "true",
        STOCK_COLLECTION_INTERVAL_SECONDS: "60",
        CRYPTO_COLLECTION_INTERVAL_SECONDS: "3600",
        FX_COLLECTION_INTERVAL_SECONDS: "7200",
      },
      { gated: false },
    );

    await vi.advanceTimersByTimeAsync(60_000);

    expect(runs).toEqual(["STOCK,ETF"]);
    scheduler.stop();
  });

  it("treats ETF and STOCK as overlapping asset types", async () => {
    const { scheduler, runs, release } = createScheduler();

    const etf = scheduler.runCollection({ assetTypes: ["ETF"] });
    const stock = await scheduler.runCollection({ assetTypes: ["STOCK", "ETF"] });
    expect(stock.errors).toEqual(["collection already running"]);
    expect(runs).toEqual(["ETF"]);

    release();
    await etf;
    scheduler.stop();
  });
});

describe("daily quote scheduler", () => {
  it("fills missing daily quotes at startup and at UTC midnight", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T12:00:00.000Z"));
    const { scheduler, dailyBackfills } = createScheduler(
      {
        COLLECTION_SCHEDULER_ENABLED: "true",
        STOCK_COLLECTION_INTERVAL_SECONDS: "86400",
        CRYPTO_COLLECTION_INTERVAL_SECONDS: "86400",
        FX_COLLECTION_INTERVAL_SECONDS: "86400",
      },
      { gated: false },
    );

    expect(dailyBackfills).toEqual(["run"]);
    // 12:00 UTC is 12 hours before the next UTC-day boundary.
    await vi.advanceTimersByTimeAsync(12 * 60 * 60 * 1000);
    expect(dailyBackfills).toEqual(["run", "run"]);

    scheduler.stop();
  });

  it("can skip the startup catch-up for one-shot CLIs", () => {
    const { scheduler, dailyBackfills } = createScheduler(
      { COLLECTION_SCHEDULER_ENABLED: "true" },
      { gated: false, catchUpDailyQuotes: false },
    );

    expect(dailyBackfills).toEqual([]);
    scheduler.stop();
  });

  it("exposes a manual daily backfill trigger", async () => {
    const { scheduler, dailyBackfills } = createScheduler({}, { gated: false });

    await scheduler.runDailyQuoteBackfill();

    expect(dailyBackfills).toEqual(["run"]);
    scheduler.stop();
  });
});
