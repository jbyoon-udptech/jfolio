import { mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { BSON, type Db } from "mongodb";
import { afterEach, describe, expect, it } from "vitest";
import { parseBackupArgs } from "../src/cli/backup-args";
import { createBackup } from "../src/db/backup";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "jfolio-backup-test-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** Minimal Mongo-like DB stub: only the methods used by createBackup. */
function fakeDb(collections: Record<string, Array<Record<string, unknown>>>): Db {
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

describe("parseBackupArgs", () => {
  it("uses safe defaults", () => {
    expect(parseBackupArgs([])).toEqual({
      exclude: [],
      gzip: false,
      help: false,
    });
  });

  it("parses paths, repeated collection lists, exclusions, and gzip", () => {
    expect(
      parseBackupArgs([
        "--out",
        "/tmp/jfolio-backup",
        "--collection",
        "users,instruments",
        "--collection=instruments,transactions",
        "--exclude",
        "sessions",
        "--gzip",
      ]),
    ).toEqual({
      out: "/tmp/jfolio-backup",
      collections: ["users", "instruments", "transactions"],
      exclude: ["sessions"],
      gzip: true,
      help: false,
    });
  });

  it("returns help early", () => {
    expect(parseBackupArgs(["--out", "ignored", "--help", "--gzip"])).toEqual({
      out: "ignored",
      exclude: [],
      gzip: false,
      help: true,
    });
  });

  it("rejects unknown options and missing values", () => {
    expect(() => parseBackupArgs(["--unknown"])).toThrow("Unknown option: --unknown");
    expect(() => parseBackupArgs(["--out"])).toThrow("Missing value for --out");
    expect(() => parseBackupArgs(["--out="])).toThrow("--out requires a directory");
    expect(() => parseBackupArgs(["--collection", ","])).toThrow(
      "--collection requires at least one collection name",
    );
    expect(() => parseBackupArgs(["--gzip=false"])).toThrow("--gzip does not take a value");
  });
});

describe("createBackup", () => {
  it("writes every collection as Extended JSON plus a manifest", async () => {
    const root = await tempRoot();
    const outDir = join(root, "backup");
    const now = new Date("2026-10-26T12:34:56.789Z");
    const id = new BSON.ObjectId("0123456789abcdef01234567");
    const createdAt = new Date("2026-01-02T03:04:05.000Z");
    const db = fakeDb({
      instruments: [{ _id: id, symbol: "AAPL", createdAt }],
      empty: [],
      "system.views": [{ name: "ignored" }],
    });

    const result = await createBackup(db, { outDir, now });

    expect(result.directory).toBe(outDir);
    expect(result.format).toBe("jfolio-backup");
    expect(result.version).toBe(1);
    expect(result.database).toBe("jfolio_test");
    expect(result.createdAt).toBe(now.toISOString());
    expect(result.gzip).toBe(false);
    expect(result.collections.map((item) => item.name)).toEqual(["empty", "instruments"]);
    expect(result.totalDocuments).toBe(1);
    expect(result.totalSizeBytes).toBeGreaterThan(0);

    const manifest = JSON.parse(await readFile(join(outDir, "manifest.json"), "utf8"));
    expect(manifest).toMatchObject({
      format: "jfolio-backup",
      version: 1,
      createdAt: now.toISOString(),
      database: "jfolio_test",
      totalDocuments: 1,
    });

    const instruments = BSON.EJSON.parse(
      await readFile(join(outDir, "instruments.json"), "utf8"),
      { relaxed: true },
    );
    expect(instruments).toHaveLength(1);
    expect(instruments[0]._id).toBeInstanceOf(BSON.ObjectId);
    expect(instruments[0].createdAt).toBeInstanceOf(Date);
    expect(instruments[0].symbol).toBe("AAPL");

    const empty = BSON.EJSON.parse(await readFile(join(outDir, "empty.json"), "utf8"), {
      relaxed: true,
    });
    expect(empty).toEqual([]);
    expect((await readdir(outDir)).sort()).toEqual([
      "empty.json",
      "instruments.json",
      "manifest.json",
    ]);
  });

  it("honors collection filters and exclusions", async () => {
    const root = await tempRoot();
    const outDir = join(root, "backup");
    const db = fakeDb({
      users: [{ userId: "usr_1" }],
      sessions: [{ _id: "session_1" }],
      instruments: [{ instrumentId: "ins_1" }],
    });

    const result = await createBackup(db, {
      outDir,
      collections: ["users", "sessions", "instruments"],
      exclude: ["sessions"],
    });

    expect(result.collections.map((item) => item.name)).toEqual(["instruments", "users"]);
    expect((await readdir(outDir)).sort()).toEqual([
      "instruments.json",
      "manifest.json",
      "users.json",
    ]);
  });

  it("rejects unknown requested collections and removes the partial directory", async () => {
    const root = await tempRoot();
    const outDir = join(root, "backup");
    const db = fakeDb({ instruments: [] });

    await expect(createBackup(db, { outDir, collections: ["missing"] })).rejects.toThrow(
      "Collection not found: missing",
    );
    expect(await readdir(root)).toEqual([]);
  });

  it("fails instead of overwriting an existing directory unless uniqueDir is set", async () => {
    const root = await tempRoot();
    const outDir = join(root, "backup");
    const db = fakeDb({ instruments: [] });
    await mkdir(outDir);

    await expect(createBackup(db, { outDir })).rejects.toThrow(
      `Backup directory already exists: ${outDir}`,
    );

    const first = await createBackup(db, { outDir, uniqueDir: true });
    const second = await createBackup(db, { outDir, uniqueDir: true });
    expect(first.directory).toBe(`${outDir}-1`);
    expect(second.directory).toBe(`${outDir}-2`);
  });

  it("gzip-compresses collection files when requested", async () => {
    const root = await tempRoot();
    const outDir = join(root, "backup");
    const db = fakeDb({ instruments: [{ symbol: "AAPL", at: new Date("2026-01-02T00:00:00Z") }] });

    const result = await createBackup(db, { outDir, gzip: true });

    expect(result.gzip).toBe(true);
    expect(result.collections[0]?.file).toBe("instruments.json.gz");
    const compressed = await readFile(join(outDir, "instruments.json.gz"));
    const text = gunzipSync(compressed).toString("utf8");
    const documents = BSON.EJSON.parse(text, { relaxed: true });
    expect(documents).toHaveLength(1);
    expect(documents[0].symbol).toBe("AAPL");
    expect(documents[0].at).toBeInstanceOf(Date);
  });

  it("creates private directory and file permissions", async () => {
    const root = await tempRoot();
    const outDir = join(root, "backup");
    const db = fakeDb({ instruments: [] });

    await createBackup(db, { outDir });

    expect((await stat(outDir)).mode & 0o777).toBe(0o700);
    expect((await stat(join(outDir, "instruments.json"))).mode & 0o777).toBe(0o600);
    expect((await stat(join(outDir, "manifest.json"))).mode & 0o777).toBe(0o600);
  });
});
