import { MongoClient, type Db } from "mongodb";
import { ensureIndexes } from "./collections";

let client: MongoClient | null = null;
let db: Db | null = null;

export interface MongoConnectionOptions {
  uri: string;
  dbName?: string;
}

function resolveDbName(uri: string, explicit?: string): string {
  if (explicit) return explicit;
  try {
    const parsed = new URL(uri);
    const fromPath = parsed.pathname.replace(/^\//, "");
    if (fromPath) return fromPath;
  } catch {
    // ignore
  }
  return "jFolio";
}

export async function connectMongo(options: MongoConnectionOptions): Promise<Db> {
  if (db) return db;
  client = new MongoClient(options.uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  db = client.db(resolveDbName(options.uri, options.dbName));
  await ensureIndexes(db);
  return db;
}

export function getDb(): Db {
  if (!db) throw new Error("MongoDB is not connected. Call connectMongo() first.");
  return db;
}

export async function disconnectMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
