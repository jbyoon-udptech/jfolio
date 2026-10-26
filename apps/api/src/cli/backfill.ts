import { config } from "../config";
import { createContainer } from "../container";
import { connectMongo, disconnectMongo } from "../db/mongo";
import { createMongoRepositories } from "../repositories/mongo";
import { BACKFILL_USAGE, parseBackfillArgs } from "./backfill-args";

/**
 * Backfills daily quote/FX history for existing instruments:
 *   yarn backfill:history [--from 2025-01-01] [--to 2026-10-26]
 *                        [--asset-type STOCK,ETF] [--instrument ins_...]
 *
 * This is the repair path for data collected before historical backfill
 * existed, or after importing an old transaction ledger.
 */
async function main(): Promise<void> {
  const args = parseBackfillArgs(process.argv.slice(2));
  if (args.help) {
    // eslint-disable-next-line no-console
    console.log(BACKFILL_USAGE);
    return;
  }

  const db = await connectMongo({ uri: config.mongo.uri, dbName: config.mongo.dbName });
  const container = createContainer(createMongoRepositories(db), config);

  const result = await container.backfill.backfillAll({
    from: args.from,
    to: args.to,
    days: args.days,
    assetTypes: args.assetTypes,
    instrumentIds: args.instrumentIds,
    interval: args.interval,
  });

  for (const item of result.results) {
    const range = item.from && item.to ? `${item.from} ~ ${item.to}` : "range unavailable";
    if (item.status === "OK") {
      // eslint-disable-next-line no-console
      console.log(
        `[backfill] ${item.symbol} (${item.assetType}) ${range}: ` +
          `inserted=${item.inserted} duplicates=${item.duplicates} rejected=${item.rejected}`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(`[backfill] ${item.symbol} (${item.assetType}) ${item.status}: ${item.message}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `[backfill] instruments=${result.instrumentsProcessed} succeeded=${result.succeeded} ` +
      `skipped=${result.skipped} failed=${result.failed} inserted=${result.inserted} ` +
      `duplicates=${result.duplicates} rejected=${result.rejected}`,
  );

  await disconnectMongo();
  if (result.failed > 0) process.exitCode = 1;
}

main().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  await disconnectMongo().catch(() => undefined);
  process.exit(1);
});
