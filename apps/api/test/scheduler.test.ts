import { afterEach, describe, expect, it, vi } from "vitest";
import type { Container } from "../src/container";
import { startScheduler } from "../src/scheduler";
import type {
  CollectionRunOptions,
  CollectionRunResult,
} from "../src/services/collection.service";
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

/** Scheduler wired to a fake collection service that blocks until released. */
function createScheduler(
  overrides: NodeJS.ProcessEnv = {},
  { gated = true }: { gated?: boolean } = {},
) {
  const config = createTestConfig({
    COLLECTION_SCHEDULER_ENABLED: "false",
    HOURLY_SNAPSHOT_ENABLED: "false",
    DAILY_SNAPSHOT_ENABLED: "false",
    ...overrides,
  });
  const runs: string[] = [];
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
  } as unknown as Container;

  return { scheduler: startScheduler(container, config), runs, release };
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
