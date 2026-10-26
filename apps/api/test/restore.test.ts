import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BSON, type Db, type Document } from "mongodb";
import { afterEach, describe, expect, it } from "vitest";
import { parseRestoreArgs } from "../src/cli/restore-args";
import { createBackup } from "../src/db/backup";
import { readBackupManifest, restoreBackup } from "../src/db/restore";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "jfolio-restore-test-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** Minimal Mongo-like source DB stub: only the methods used by createBackup. */
function fakeSourceDb(collections: Record<string, Array<Record<string, unknown>>>): Db {
  const names = Object.keys(collections).sort();
  return {
    databaseName: "jfolio_test",
    listCollections: () => ({
      toArray: async () => names.map((name) => ({ name, type: "collection" })),
    }),
    collection: (name: string) => {
      const documents = collections[name] ?? [];
      return {
        find: () => ({
          async *[Symbol.asyncIterator]() {
            for (const document of documents) yield document;
          },
          close: async () => undefined,
        }),
      };
    },
  } as unknown as Db;
}

interface BulkOperation {
  insertOne?: { document: Document };
  replaceOne?: { filter: Document; replacement: Document; upsert?: boolean };
}

interface FakeTarget {
  db: Db;
  store: Map<string, Document[]>;
  drops: string[];
  bulkWriteCalls: () => number;
}

/** In-memory target DB stub for drop and bulkWrite. */
function fakeTargetDb(initial: Record<string, Document[]> = {}): FakeTarget {
  const store = new Map<string, Document[]>(
    Object.entries(initial).map(([name, documents]) => [
      name,
      documents.map((document) => ({ ...document })),
    ]),
  );
  const drops: string[] = [];
  let bulkWriteCalls = 0;

  const db = {
    databaseName: "jfolio_test",
    collection: (name: string) => ({
      drop: async () => {
        drops.push(name);
        if (!store.has(name)) {
          throw Object.assign(new Error("ns not found"), {
            code: 26,
            codeName: "NamespaceNotFound",
          });
        }
        store.delete(name);
        return true;
      },
      bulkWrite: async (operations: unknown) => {
        bulkWriteCalls += 1;
        const documents = store.get(name) ?? [];
        for (const operation of operations as BulkOperation[]) {
          if (operation.insertOne) {
            documents.push(operation.insertOne.document);
            continue;
          }
          if (operation.replaceOne) {
            const id = operation.replaceOne.filter._id;
            const index = documents.findIndex(
              (document) => String(document._id) === String(id),
            );
            if (index >= 0) documents[index] = operation.replaceOne.replacement;
            else documents.push(operation.replaceOne.replacement);
            continue;
          }
          throw new Error("Unsupported bulk operation in test");
        }
        store.set(name, documents);
        return { acknowledged: true };
      },
    }),
  } as unknown as Db;

  return {
    db,
    store,
    drops,
    bulkWriteCalls: () => bulkWriteCalls,
  };
}

async function makeBackup(
  root: string,
  collections: Record<string, Array<Record<string, unknown>>>,
  gzip = false,
): Promise<string> {
  const outDir = join(root, "backup");
  await createBackup(fakeSourceDb(collections), { outDir, gzip });
  return outDir;
}

function ejson(documents: Document[] | undefined): string {
  return BSON.EJSON.stringify(documents ?? [], undefined, 2);
}

describe("parseRestoreArgs", () => {
  it("requires a backup directory", () => {
    expect(parseRestoreArgs(["--dir", "/tmp/backup"])).toEqual({
      dir: "/tmp/backup",
      exclude: [],
      drop: false,
      dryRun: false,
      help: false,
    });
    expect(() => parseRestoreArgs([])).toThrow("Missing required option: --dir");
  });

  it("parses collection filters, drop, and dry-run", () => {
    expect(
      parseRestoreArgs([
        "--dir=/tmp/backup",
        "--collection",
        "users,instruments",
        "--collection=instruments,transactions",
        "--exclude",
        "sessions",
        "--drop",
        "--dry-run",
      ]),
    ).toEqual({
      dir: "/tmp/backup",
      collections: ["users", "instruments", "transactions"],
      exclude: ["sessions"],
      drop: true,
      dryRun: true,
      help: false,
    });
  });

  it("returns help early", () => {
    expect(parseRestoreArgs(["--dir", "ignored", "--help", "--drop"])).toEqual({
      dir: "ignored",
      exclude: [],
      drop: false,
      dryRun: false,
      help: true,
    });
  });

  it("rejects unknown options, missing values, and boolean values", () => {
    expect(() => parseRestoreArgs(["--unknown"])).toThrow("Unknown option: --unknown");
    expect(() => parseRestoreArgs(["--dir"])).toThrow("Missing value for --dir");
    expect(() => parseRestoreArgs(["--dir="])).toThrow("--dir requires a backup directory");
    expect(() => parseRestoreArgs(["--dir", "/tmp/backup", "--collection", ","])).toThrow(
      "--collection requires at least one collection name",
    );
    expect(() => parseRestoreArgs(["--dir", "/tmp/backup", "--drop=false"])).toThrow(
      "--drop does not take a value",
    );
    expect(() => parseRestoreArgs(["--dir", "/tmp/backup", "--dry-run=false"])).toThrow(
      "--dry-run does not take a value",
    );
  });
});

describe("restoreBackup", () => {
  it("restores collections with drop and preserves EJSON types", async () => {
    const root = await tempRoot();
    const instruments: Document[] = [
      {
        _id: new BSON.ObjectId("0123456789abcdef01234567"),
        symbol: "AAPL",
        note: 'contains ] } " \\ and\na newline',
        nested: { values: [1, { deep: true }] },
        createdAt: new Date("2026-01-02T03:04:05.000Z"),
      },
      {
        _id: new BSON.ObjectId("0123456789abcdef01234568"),
        symbol: "MSFT",
        amount: 12.5,
        nullable: null,
      },
    ];
    const portfolios: Document[] = [{ _id: "pf_1", name: "Main" }];
    const dir = await makeBackup(root, { instruments, empty: [], portfolios });

    const target = fakeTargetDb({
      instruments: [{ _id: "stale", symbol: "OLD" }],
      portfolios: [{ _id: "pf_old", name: "Old" }],
      unrelated: [{ _id: "keep", value: true }],
    });

    const result = await restoreBackup(target.db, { dir, drop: true });

    expect(result.directory).toBe(dir);
    expect(result.manifest).toMatchObject({
      format: "jfolio-backup",
      version: 1,
      database: "jfolio_test",
    });
    expect(result.collections.map((item) => item.name)).toEqual([
      "empty",
      "instruments",
      "portfolios",
    ]);
    expect(result.collections.find((item) => item.name === "empty")?.documents).toBe(0);
    expect(result.totalDocuments).toBe(3);
    expect(result.drop).toBe(true);
    expect(result.dryRun).toBe(false);

    expect(target.drops).toEqual(["empty", "instruments", "portfolios"]);
    expect(ejson(target.store.get("instruments"))).toBe(ejson(instruments));
    expect(ejson(target.store.get("portfolios"))).toBe(ejson(portfolios));
    expect(target.store.has("empty")).toBe(false);
    expect(ejson(target.store.get("unrelated"))).toBe(ejson([{ _id: "keep", value: true }]));
    expect(target.bulkWriteCalls()).toBe(2);
  });

  it("upserts by _id without dropping and keeps stale documents", async () => {
    const root = await tempRoot();
    const firstId = new BSON.ObjectId("0123456789abcdef01234567");
    const ids = [
      firstId,
      new BSON.ObjectId("0123456789abcdef01234568"),
      new BSON.ObjectId("0123456789abcdef01234569"),
    ];
    const dir = await makeBackup(root, {
      instruments: [
        { _id: ids[0], symbol: "NEW" },
        { _id: ids[1], symbol: "SECOND" },
        { _id: ids[2], symbol: "THIRD" },
        { symbol: "NO_ID" },
      ],
    });

    const target = fakeTargetDb({
      instruments: [
        { _id: firstId, symbol: "OLD", obsolete: true },
        { _id: "stale", symbol: "STALE" },
      ],
    });

    const result = await restoreBackup(target.db, { dir, batchSize: 2 });

    expect(result.drop).toBe(false);
    expect(result.totalDocuments).toBe(4);
    expect(target.drops).toEqual([]);
    expect(target.bulkWriteCalls()).toBe(2);

    const restored = target.store.get("instruments") ?? [];
    expect(restored).toHaveLength(5);
    expect(restored[0]).toMatchObject({ _id: firstId, symbol: "NEW" });
    expect(restored[0]).not.toHaveProperty("obsolete");
    expect(restored[1]).toMatchObject({ _id: "stale", symbol: "STALE" });
    expect(restored.some((document) => document.symbol === "NO_ID")).toBe(true);
  });

  it("restores gzip backups and honors collection filters and exclusions", async () => {
    const root = await tempRoot();
    const dir = await makeBackup(
      root,
      {
        users: [{ _id: "u1", email: "user@example.com" }],
        sessions: [{ _id: "s1" }],
        instruments: [{ _id: "i1", symbol: "AAPL" }],
      },
      true,
    );

    const target = fakeTargetDb({
      sessions: [{ _id: "keep" }],
      instruments: [{ _id: "old" }],
    });

    const result = await restoreBackup(target.db, {
      dir,
      collections: ["users", "sessions"],
      exclude: ["sessions"],
      drop: true,
    });

    expect(result.manifest.gzip).toBe(true);
    expect(result.collections.map((item) => item.name)).toEqual(["users"]);
    expect(result.totalDocuments).toBe(1);
    expect(target.drops).toEqual(["users"]);
    expect(ejson(target.store.get("users"))).toBe(
      ejson([{ _id: "u1", email: "user@example.com" }]),
    );
    expect(ejson(target.store.get("sessions"))).toBe(ejson([{ _id: "keep" }]));
    expect(ejson(target.store.get("instruments"))).toBe(ejson([{ _id: "old" }]));
  });

  it("rejects unknown collection filters before writing", async () => {
    const root = await tempRoot();
    const dir = await makeBackup(root, { instruments: [{ _id: "i1" }] });
    const target = fakeTargetDb({ instruments: [{ _id: "keep" }] });

    await expect(
      restoreBackup(target.db, { dir, collections: ["missing"], drop: true }),
    ).rejects.toThrow("Collection not found in backup: missing");
    expect(target.drops).toEqual([]);
    expect(ejson(target.store.get("instruments"))).toBe(ejson([{ _id: "keep" }]));
  });

  it("does not write during a dry run", async () => {
    const root = await tempRoot();
    const dir = await makeBackup(root, { instruments: [{ _id: "i1" }, { _id: "i2" }] });
    const target = fakeTargetDb({ instruments: [{ _id: "keep" }] });

    const result = await restoreBackup(target.db, { dir, drop: true, dryRun: true });

    expect(result.drop).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.totalDocuments).toBe(2);
    expect(result.collections[0]?.documents).toBe(2);
    expect(target.drops).toEqual([]);
    expect(target.bulkWriteCalls()).toBe(0);
    expect(ejson(target.store.get("instruments"))).toBe(ejson([{ _id: "keep" }]));
  });

  it("rejects manifest file paths that escape the backup directory before writing", async () => {
    const root = await tempRoot();
    const dir = await makeBackup(root, { instruments: [{ _id: "i1" }] });
    const manifestPath = join(dir, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.collections[0].file = "../outside.json";
    await writeFile(manifestPath, JSON.stringify(manifest));
    await writeFile(join(root, "outside.json"), "[]");

    const target = fakeTargetDb({ instruments: [{ _id: "keep" }] });

    await expect(restoreBackup(target.db, { dir, drop: true })).rejects.toThrow(
      "escapes the backup directory",
    );
    expect(target.drops).toEqual([]);
    expect(ejson(target.store.get("instruments"))).toBe(ejson([{ _id: "keep" }]));
  });

  it("validates the manifest format and version", async () => {
    const root = await tempRoot();
    const dir = await makeBackup(root, { instruments: [{ _id: "i1" }] });
    const manifestPath = join(dir, "manifest.json");

    expect(await readBackupManifest(dir)).toMatchObject({
      format: "jfolio-backup",
      version: 1,
      totalDocuments: 1,
    });

    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.version = 2;
    await writeFile(manifestPath, JSON.stringify(manifest));

    await expect(readBackupManifest(dir)).rejects.toThrow("Unsupported backup version: 2");
  });

  it("fails on a truncated collection file", async () => {
    const root = await tempRoot();
    const dir = await makeBackup(root, {
      instruments: [{ _id: "i1" }, { _id: "i2" }, { _id: "i3" }],
    });
    const file = join(dir, "instruments.json");
    const text = await readFile(file, "utf8");
    await writeFile(file, text.slice(0, Math.floor(text.length / 2)));

    const target = fakeTargetDb();

    await expect(restoreBackup(target.db, { dir })).rejects.toThrow(
      "Failed to restore collection instruments",
    );
    expect(target.store.has("instruments")).toBe(false);
  });

  it("streams documents that span read chunks", async () => {
    const root = await tempRoot();
    const payload = "x".repeat(100_000) + ']}"\\';
    const dir = await makeBackup(root, { instruments: [{ _id: "big", payload }] });
    const target = fakeTargetDb();

    await restoreBackup(target.db, { dir, drop: true });

    const restored = target.store.get("instruments")?.[0];
    expect(restored?.payload).toBe(payload);
  });
});
