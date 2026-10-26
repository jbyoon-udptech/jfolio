import { createWriteStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { BSON, type Db, type Document } from "mongodb";

export const BACKUP_FORMAT = "jfolio-backup";
export const BACKUP_VERSION = 1;

const SYSTEM_COLLECTION_PREFIX = "system.";
export const MANIFEST_FILE = "manifest.json";

export interface BackupOptions {
  /** Destination directory. The caller owns choosing a unique path if desired. */
  outDir: string;
  /** Collection names to include. Defaults to every non-system collection. */
  collections?: string[];
  /** Collection names to skip after applying `collections`. */
  exclude?: string[];
  /** Timestamp recorded in the manifest; injectable for deterministic tests. */
  now?: Date;
  /** Compress each collection file with gzip. */
  gzip?: boolean;
  /** Append -1, -2, ... when `outDir` already exists instead of failing. */
  uniqueDir?: boolean;
}

export interface BackupCollectionResult {
  name: string;
  file: string;
  documents: number;
  sizeBytes: number;
}

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  database: string;
  gzip: boolean;
  collections: BackupCollectionResult[];
  totalDocuments: number;
  totalSizeBytes: number;
}

export interface BackupResult extends BackupManifest {
  directory: string;
}

/**
 * Creates a logical, read-only export of the current database. Documents are
 * streamed as MongoDB Extended JSON so ObjectId/Date values survive a restore,
 * and large collections never have to fit in memory all at once.
 *
 * This is not a transactional snapshot: writes that happen while the export is
 * running can appear in some collections and not others.
 */
export async function createBackup(db: Db, options: BackupOptions): Promise<BackupResult> {
  const now = options.now ?? new Date();
  const gzip = options.gzip ?? false;
  const outDir = resolve(options.outDir);
  const directory = await createDirectory(outDir, options.uniqueDir ?? false);

  try {
    const names = await listCollectionNames(db, options.collections, options.exclude);
    const collections: BackupCollectionResult[] = [];

    for (const name of names) {
      const file = collectionFileName(name, gzip);
      if (file === MANIFEST_FILE) {
        throw new Error(`Collection name conflicts with ${MANIFEST_FILE}: ${name}`);
      }
      const filePath = join(directory, file);
      const documents = await writeCollection(db, name, filePath, gzip);
      const sizeBytes = (await stat(filePath)).size;
      collections.push({ name, file, documents, sizeBytes });
    }

    const manifest: BackupManifest = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: now.toISOString(),
      database: db.databaseName,
      gzip,
      collections,
      totalDocuments: collections.reduce((sum, item) => sum + item.documents, 0),
      totalSizeBytes: collections.reduce((sum, item) => sum + item.sizeBytes, 0),
    };

    // Write the manifest last. Its presence indicates that every collection file
    // finished writing, so an interrupted process leaves an incomplete directory
    // without a manifest.
    await writeFile(join(directory, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, {
      mode: 0o600,
    });

    return { ...manifest, directory };
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function createDirectory(outDir: string, unique: boolean): Promise<string> {
  await mkdir(dirname(outDir), { recursive: true, mode: 0o700 });

  if (!unique) {
    try {
      await mkdir(outDir, { mode: 0o700 });
      return outDir;
    } catch (error) {
      if (errorCode(error) === "EEXIST") {
        throw new Error(`Backup directory already exists: ${outDir}`);
      }
      throw error;
    }
  }

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = attempt === 0 ? outDir : `${outDir}-${attempt}`;
    try {
      await mkdir(candidate, { mode: 0o700 });
      return candidate;
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
    }
  }
  throw new Error(`Could not allocate a unique backup directory near ${outDir}`);
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return String((error as { code?: unknown }).code);
}

async function listCollectionNames(
  db: Db,
  include: string[] | undefined,
  exclude: string[] | undefined,
): Promise<string[]> {
  const available = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((item) => item.name)
    .filter((name) => !name.startsWith(SYSTEM_COLLECTION_PREFIX))
    .sort();

  let names = available;
  if (include && include.length > 0) {
    const missing = include.filter((name) => !available.includes(name));
    if (missing.length > 0) {
      throw new Error(`Collection not found: ${missing.join(", ")}`);
    }
    const wanted = new Set(include);
    names = available.filter((name) => wanted.has(name));
  }

  const excluded = new Set(exclude ?? []);
  return names.filter((name) => !excluded.has(name));
}

function collectionFileName(name: string, gzip: boolean): string {
  return `${encodeURIComponent(name)}.json${gzip ? ".gz" : ""}`;
}

async function writeCollection(
  db: Db,
  name: string,
  filePath: string,
  gzip: boolean,
): Promise<number> {
  const cursor = db.collection<Document>(name).find({});
  let documents = 0;

  async function* generate(): AsyncGenerator<string> {
    try {
      yield "[";
      for await (const document of cursor) {
        yield documents > 0 ? ",\n" : "\n";
        yield BSON.EJSON.stringify(document, undefined, 2, { relaxed: true });
        documents += 1;
      }
      yield documents > 0 ? "\n]\n" : "]\n";
    } finally {
      await cursor.close().catch(() => undefined);
    }
  }

  const output = createWriteStream(filePath, { mode: 0o600 });
  const source = Readable.from(generate(), { objectMode: false });
  if (gzip) {
    await pipeline(source, createGzip(), output);
  } else {
    await pipeline(source, output);
  }
  return documents;
}
