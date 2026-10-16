import { createServer } from "node:http";
import { config } from "./config";
import { createContainer } from "./container";
import { createApp } from "./api/app";
import { connectMongo, disconnectMongo } from "./db/mongo";
import { createMongoRepositories } from "./repositories/mongo";
import { startScheduler } from "./scheduler";

async function main(): Promise<void> {
  const db = await connectMongo({ uri: config.mongo.uri, dbName: config.mongo.dbName });
  // eslint-disable-next-line no-console
  console.log(`[jfolio] connected to MongoDB database "${db.databaseName}"`);

  const repos = createMongoRepositories(db);
  const container = createContainer(repos, config);
  const app = createApp(container, config);

  const scheduler = startScheduler(container, config);
  const server = createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(config.api.port, config.api.host, () => resolve());
  });
  // eslint-disable-next-line no-console
  console.log(
    `[jfolio] API listening on http://${config.api.host}:${config.api.port}${config.api.basePath}`,
  );

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`[jfolio] received ${signal}, shutting down`);
    scheduler.stop();
    server.close();
    await disconnectMongo();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[jfolio] fatal startup error:", error);
  process.exit(1);
});
