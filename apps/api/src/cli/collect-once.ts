import { config } from "../config";
import { createContainer } from "../container";
import { connectMongo, disconnectMongo } from "../db/mongo";
import { createMongoRepositories } from "../repositories/mongo";
import { startScheduler } from "../scheduler";

/**
 * One-shot collection pass, useful for cron / manual runs:
 *   yarn collect:once [STOCK,ETF,CRYPTO,FX]
 */
async function main(): Promise<void> {
  const db = await connectMongo({ uri: config.mongo.uri, dbName: config.mongo.dbName });
  const container = createContainer(createMongoRepositories(db), config);
  const scheduler = startScheduler(container, config);

  const requested = process.argv[2]?.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const assetTypes = requested as import("@jfolio/shared").AssetType[] | undefined;

  const result = await scheduler.runCollection(assetTypes?.length ? { assetTypes } : undefined);
  scheduler.stop();

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result, null, 2));
  await disconnectMongo();
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[collect:once] failed:", error);
  process.exit(1);
});
