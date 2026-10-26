import { resolve } from "node:path";
import { config } from "../config";
import { createBackup } from "../db/backup";
import { connectMongo, disconnectMongo } from "../db/mongo";
import { BACKUP_USAGE, parseBackupArgs } from "./backup-args";

/**
 * Backs up the current database without requiring mongodump:
 *
 *   yarn backup
 *   yarn backup --out /mnt/backups/jfolio --exclude sessions
 *   yarn backup --collection users,instruments,transactions
 *
 * `backup/` is gitignored, so the default output is safe for local use.
 */
const REPO_ROOT = resolve(__dirname, "../../../..");

function defaultOutDir(now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(".", "");
  return resolve(REPO_ROOT, "backup", `jfolio-backup-${stamp}`);
}

async function main(): Promise<void> {
  const args = parseBackupArgs(process.argv.slice(2));
  if (args.help) {
    // eslint-disable-next-line no-console
    console.log(BACKUP_USAGE);
    return;
  }

  const now = new Date();
  const outDir = args.out ? resolve(REPO_ROOT, args.out) : defaultOutDir(now);
  const db = await connectMongo({ uri: config.mongo.uri, dbName: config.mongo.dbName });

  try {
    const result = await createBackup(db, {
      outDir,
      collections: args.collections,
      exclude: args.exclude,
      now,
      gzip: args.gzip,
      uniqueDir: args.out === undefined,
    });

    // eslint-disable-next-line no-console
    console.log(`[backup] database=${result.database} directory=${result.directory}`);
    for (const item of result.collections) {
      // eslint-disable-next-line no-console
      console.log(
        `[backup] ${item.name}: documents=${item.documents} bytes=${item.sizeBytes} file=${item.file}`,
      );
    }
    // eslint-disable-next-line no-console
    console.log(
      `[backup] collections=${result.collections.length} documents=${result.totalDocuments} ` +
        `bytes=${result.totalSizeBytes} gzip=${result.gzip}`,
    );

    if (result.collections.some((item) => item.name === "users" || item.name === "sessions")) {
      // eslint-disable-next-line no-console
      console.log("[backup] contains credentials/session data; keep the directory private.");
    }
  } finally {
    await disconnectMongo();
  }
}

main().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error("[backup] failed:", error instanceof Error ? error.message : error);
  await disconnectMongo().catch(() => undefined);
  process.exit(1);
});
