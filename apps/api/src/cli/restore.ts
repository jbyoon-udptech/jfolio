import { resolve } from "node:path";
import { config } from "../config";
import { ensureIndexes } from "../db/collections";
import { connectMongo, disconnectMongo } from "../db/mongo";
import { readBackupManifest, restoreBackup } from "../db/restore";
import { RESTORE_USAGE, parseRestoreArgs } from "./restore-args";

/**
 * Restores a logical backup created by `yarn backup`:
 *
 *   yarn restore --dir backup/jfolio-backup-20261026T084332516Z
 *   yarn restore --dir backup/jfolio-backup-20261026T084332516Z --drop
 *   yarn restore --dir backup/jfolio-backup-20261026T084332516Z --dry-run
 */
const REPO_ROOT = resolve(__dirname, "../../../..");

async function main(): Promise<void> {
  const args = parseRestoreArgs(process.argv.slice(2));
  if (args.help) {
    // eslint-disable-next-line no-console
    console.log(RESTORE_USAGE);
    return;
  }

  const dirArg = args.dir;
  if (!dirArg) {
    throw new Error("Missing required option: --dir");
  }
  const dir = resolve(REPO_ROOT, dirArg);

  // Validate the manifest before opening a connection. restoreBackup reads it
  // again, but that is cheap and keeps the restore core self-contained.
  const manifest = await readBackupManifest(dir);
  const db = await connectMongo({
    uri: config.mongo.uri,
    dbName: config.mongo.dbName,
    // A dry run must not create indexes/collections on the target database.
    ensureIndexes: !args.dryRun,
  });

  try {
    // eslint-disable-next-line no-console
    console.log(
      `[restore] backup=${dir} database=${manifest.database} createdAt=${manifest.createdAt} ` +
        `target=${db.databaseName} mode=${args.drop ? "drop" : "upsert"} dryRun=${args.dryRun}`,
    );

    if (manifest.database !== db.databaseName) {
      // eslint-disable-next-line no-console
      console.warn(
        `[restore] warning: backup database (${manifest.database}) differs from ` +
          `target database (${db.databaseName})`,
      );
    }

    const result = await restoreBackup(db, {
      dir,
      collections: args.collections,
      exclude: args.exclude,
      drop: args.drop,
      dryRun: args.dryRun,
    });

    for (const item of result.collections) {
      // eslint-disable-next-line no-console
      console.log(
        `[restore] ${item.name}: documents=${item.documents} ` +
          `expected=${item.expectedDocuments} file=${item.file}`,
      );
      if (!result.dryRun && item.documents !== item.expectedDocuments) {
        // eslint-disable-next-line no-console
        console.warn(
          `[restore] warning: ${item.name} restored ${item.documents} documents, ` +
            `but the manifest recorded ${item.expectedDocuments}`,
        );
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `[restore] collections=${result.collections.length} documents=${result.totalDocuments} ` +
        `mode=${result.drop ? "drop" : "upsert"} dryRun=${result.dryRun}`,
    );

    if (result.dryRun) {
      // eslint-disable-next-line no-console
      console.log("[restore] dry-run: no documents were written.");
    } else if (result.drop && result.collections.length > 0) {
      // Dropping a collection removes its indexes. Recreate the application's
      // known indexes now rather than waiting for the next API restart.
      await ensureIndexes(db);
      // eslint-disable-next-line no-console
      console.log("[restore] application indexes ensured after drop.");
    }

    if (
      result.collections.some((item) => item.name === "users" || item.name === "sessions")
    ) {
      // eslint-disable-next-line no-console
      console.log(
        "[restore] includes credentials/session data; keep the backup directory private.",
      );
    }
  } finally {
    await disconnectMongo();
  }
}

main().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error("[restore] failed:", error instanceof Error ? error.message : error);
  await disconnectMongo().catch(() => undefined);
  process.exit(1);
});
