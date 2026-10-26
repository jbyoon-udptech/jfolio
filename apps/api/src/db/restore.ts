import { createReadStream } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { createGunzip } from "node:zlib";
import {
  BSON,
  type AnyBulkWriteOperation,
  type Collection,
  type Db,
  type Document,
} from "mongodb";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  MANIFEST_FILE,
  type BackupCollectionResult,
  type BackupManifest,
} from "./backup";

const DEFAULT_BATCH_SIZE = 500;

export interface RestoreOptions {
  /** Directory produced by `yarn backup`, containing manifest.json. */
  dir: string;
  /** Collection names to restore. Defaults to every collection in the manifest. */
  collections?: string[];
  /** Collection names to skip after applying `collections`. */
  exclude?: string[];
  /** Drop each selected collection before restoring it. */
  drop?: boolean;
  /** Validate the plan and files without writing to MongoDB. */
  dryRun?: boolean;
  /** Documents per bulk write. Defaults to 500. */
  batchSize?: number;
}

export interface RestoredCollection {
  name: string;
  file: string;
  /** Documents restored, or the manifest count in dry-run mode. */
  documents: number;
  /** Document count recorded in the backup manifest. */
  expectedDocuments: number;
}

export interface RestoreResult {
  directory: string;
  manifest: BackupManifest;
  collections: RestoredCollection[];
  totalDocuments: number;
  drop: boolean;
  dryRun: boolean;
}

/**
 * Restores a logical backup created by `createBackup`.
 *
 * Without `drop`, documents are upserted by `_id` and documents that exist only
 * in the target database are left untouched. With `drop`, each selected
 * collection is removed first, so the result matches the backup exactly.
 */
export async function restoreBackup(db: Db, options: RestoreOptions): Promise<RestoreResult> {
  const directory = resolve(options.dir);
  const manifest = await readBackupManifest(directory);
  const selected = selectCollections(manifest, options.collections, options.exclude);
  const drop = options.drop ?? false;
  const dryRun = options.dryRun ?? false;
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error("batchSize must be a positive integer");
  }

  const plans = selected.map((entry) => ({
    entry,
    filePath: resolveCollectionFile(directory, entry.file),
  }));
  await Promise.all(plans.map((plan) => assertRegularFile(plan.filePath)));

  const collections: RestoredCollection[] = [];
  for (const plan of plans) {
    const entry = plan.entry;
    const documents = dryRun
      ? entry.documents
      : await restoreCollection(db, entry, plan.filePath, drop, batchSize);
    collections.push({
      name: entry.name,
      file: entry.file,
      documents,
      expectedDocuments: entry.documents,
    });
  }

  return {
    directory,
    manifest,
    collections,
    totalDocuments: collections.reduce((sum, item) => sum + item.documents, 0),
    drop,
    dryRun,
  };
}

export async function readBackupManifest(directory: string): Promise<BackupManifest> {
  const root = resolve(directory);
  const manifestPath = resolve(root, MANIFEST_FILE);
  const info = await lstat(manifestPath).catch((error: unknown) => {
    throw new Error(`Cannot read backup manifest ${manifestPath}: ${errorMessage(error)}`);
  });
  if (!info.isFile()) {
    throw new Error(`Backup manifest is not a regular file: ${manifestPath}`);
  }

  let text: string;
  try {
    text = await readFile(manifestPath, "utf8");
  } catch (error) {
    throw new Error(`Cannot read backup manifest ${manifestPath}: ${errorMessage(error)}`);
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON in backup manifest ${manifestPath}: ${errorMessage(error)}`);
  }
  return parseBackupManifest(value);
}

export function parseBackupManifest(value: unknown): BackupManifest {
  if (!isRecord(value)) {
    throw new Error("Backup manifest must be a JSON object");
  }
  if (value.format !== BACKUP_FORMAT) {
    throw new Error(`Unsupported backup format: ${String(value.format)}`);
  }
  if (value.version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version: ${String(value.version)}`);
  }

  const database = requireString(value.database, "database");
  const createdAt = requireString(value.createdAt, "createdAt");
  if (typeof value.gzip !== "boolean") {
    throw new Error("Backup manifest gzip must be a boolean");
  }
  if (!Array.isArray(value.collections)) {
    throw new Error("Backup manifest collections must be an array");
  }

  const collections = value.collections.map((entry, index) => parseCollection(entry, index));
  const names = new Set<string>();
  const files = new Set<string>();
  for (const entry of collections) {
    if (names.has(entry.name)) {
      throw new Error(`Duplicate collection in backup manifest: ${entry.name}`);
    }
    if (files.has(entry.file)) {
      throw new Error(`Duplicate file in backup manifest: ${entry.file}`);
    }
    names.add(entry.name);
    files.add(entry.file);
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt,
    database,
    gzip: value.gzip,
    collections,
    totalDocuments: collections.reduce((sum, entry) => sum + entry.documents, 0),
    totalSizeBytes: collections.reduce((sum, entry) => sum + entry.sizeBytes, 0),
  };
}

function selectCollections(
  manifest: BackupManifest,
  include: string[] | undefined,
  exclude: string[] | undefined,
): BackupCollectionResult[] {
  let selected = manifest.collections;

  if (include && include.length > 0) {
    const available = new Set(manifest.collections.map((entry) => entry.name));
    const missing = include.filter((name) => !available.has(name));
    if (missing.length > 0) {
      throw new Error(`Collection not found in backup: ${missing.join(", ")}`);
    }
    const wanted = new Set(include);
    selected = selected.filter((entry) => wanted.has(entry.name));
  }

  const excluded = new Set(exclude ?? []);
  return selected.filter((entry) => !excluded.has(entry.name));
}

function resolveCollectionFile(directory: string, file: string): string {
  if (!file || file === MANIFEST_FILE) {
    throw new Error(`Invalid collection file in backup manifest: ${file}`);
  }
  if (isAbsolute(file)) {
    throw new Error(`Invalid absolute collection file in backup manifest: ${file}`);
  }

  const root = resolve(directory);
  const filePath = resolve(root, file);
  const relativePath = relative(root, filePath);
  if (
    !relativePath ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`Collection file escapes the backup directory: ${file}`);
  }
  return filePath;
}

async function assertRegularFile(filePath: string): Promise<void> {
  const info = await lstat(filePath).catch((error: unknown) => {
    throw new Error(`Cannot read backup file ${filePath}: ${errorMessage(error)}`);
  });
  if (!info.isFile()) {
    throw new Error(`Backup file is not a regular file: ${filePath}`);
  }
}

async function restoreCollection(
  db: Db,
  entry: BackupCollectionResult,
  filePath: string,
  drop: boolean,
  batchSize: number,
): Promise<number> {
  const collection = db.collection<Document>(entry.name);

  if (drop) {
    await dropCollection(collection).catch((error: unknown) => {
      throw new Error(
        `Failed to drop collection ${entry.name} before restore: ${errorMessage(error)}`,
      );
    });
  }

  let documents = 0;
  let batch: Document[] = [];
  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    const operations: AnyBulkWriteOperation<Document>[] = batch.map((document) => {
      if (drop || document._id === undefined) {
        return { insertOne: { document } };
      }
      return {
        replaceOne: {
          filter: { _id: document._id },
          replacement: document,
          upsert: true,
        },
      };
    });
    await collection.bulkWrite(operations, { ordered: true });
    documents += batch.length;
    batch = [];
  };

  try {
    for await (const document of readEjsonArray(filePath)) {
      batch.push(document);
      if (batch.length >= batchSize) {
        await flush();
      }
    }
    await flush();
  } catch (error) {
    throw new Error(
      `Failed to restore collection ${entry.name} from ${entry.file}: ${errorMessage(error)}`,
    );
  }

  return documents;
}

async function dropCollection(collection: Collection<Document>): Promise<void> {
  try {
    await collection.drop();
  } catch (error) {
    if (isNamespaceNotFound(error)) return;
    throw error;
  }
}

function isNamespaceNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as { code?: unknown; codeName?: unknown };
  return record.code === 26 || record.codeName === "NamespaceNotFound";
}

/**
 * Streams a JSON array produced by the backup writer. It tracks braces and
 * string escapes so each top-level document can be EJSON-parsed and written in
 * batches without loading the whole collection file into memory.
 */
async function* readEjsonArray(filePath: string): AsyncGenerator<Document> {
  const input = createReadStream(filePath);
  const stream = filePath.endsWith(".gz") ? input.pipe(createGunzip()) : input;
  stream.setEncoding("utf8");

  let buffer = "";
  let started = false;
  let done = false;
  let inValue = false;
  let valueStart = 0;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let position = 0;

  try {
    for await (const chunk of stream) {
      buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");

      while (position < buffer.length) {
        if (!started) {
          const char = buffer[position]!;
          if (char === "[") {
            started = true;
            position += 1;
            continue;
          }
          if (isWhitespace(char)) {
            position += 1;
            continue;
          }
          throw new Error("Expected '[' at the start of the backup array");
        }

        if (done) {
          const char = buffer[position]!;
          if (!isWhitespace(char)) {
            throw new Error("Unexpected data after the backup array");
          }
          position += 1;
          continue;
        }

        if (!inValue) {
          const char = buffer[position]!;
          if (char === "]") {
            done = true;
            position += 1;
            continue;
          }
          if (char === "," || isWhitespace(char)) {
            position += 1;
            continue;
          }
          if (char !== "{") {
            throw new Error("Expected a JSON object in the backup array");
          }
          inValue = true;
          valueStart = position;
          depth = 0;
          inString = false;
          escaped = false;
        }

        const char = buffer[position]!;
        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (char === "\\") {
            escaped = true;
          } else if (char === '"') {
            inString = false;
          }
          position += 1;
          continue;
        }

        if (char === '"') {
          inString = true;
          position += 1;
          continue;
        }
        if (char === "{" || char === "[") {
          depth += 1;
          position += 1;
          continue;
        }
        if (char === "}" || char === "]") {
          depth -= 1;
          if (depth < 0) {
            throw new Error("Unbalanced JSON object in the backup array");
          }
          position += 1;
          if (depth === 0) {
            const text = buffer.slice(valueStart, position);
            const document = BSON.EJSON.parse(text, { relaxed: true });
            if (!isRecord(document)) {
              throw new Error("Backup array item is not a JSON object");
            }
            inValue = false;
            yield document;
          }
          continue;
        }
        position += 1;
      }

      if (done) {
        buffer = "";
        position = 0;
        break;
      }
      if (inValue) {
        // Keep the in-progress document, discard any earlier documents, and
        // resume at the first byte of the next chunk.
        if (valueStart > 0) {
          buffer = buffer.slice(valueStart);
          position -= valueStart;
          valueStart = 0;
        }
      } else {
        buffer = "";
        position = 0;
      }
    }
  } finally {
    stream.destroy();
    if (stream !== input) input.destroy();
  }

  if (inValue) {
    throw new Error("Backup file ended in the middle of a document");
  }
  if (!started) {
    throw new Error("Backup file is not a JSON array");
  }
  if (!done) {
    throw new Error("Backup file ended before the JSON array closed");
  }
}

function isWhitespace(char: string): boolean {
  return char === " " || char === "\n" || char === "\r" || char === "\t";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCollection(value: unknown, index: number): BackupCollectionResult {
  if (!isRecord(value)) {
    throw new Error(`Backup manifest collections[${index}] must be an object`);
  }
  return {
    name: requireString(value.name, `collections[${index}].name`),
    file: requireString(value.file, `collections[${index}].file`),
    documents: requireNonNegativeInteger(value.documents, `collections[${index}].documents`),
    sizeBytes: requireNonNegativeInteger(value.sizeBytes, `collections[${index}].sizeBytes`),
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Backup manifest ${field} must be a non-empty string`);
  }
  return value;
}

function requireNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Backup manifest ${field} must be a non-negative integer`);
  }
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
