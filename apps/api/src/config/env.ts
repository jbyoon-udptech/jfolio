import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_BASE_CURRENCY, DEFAULT_TIMEZONE } from "@jfolio/shared";

// Load .env from the repo root if present (apps/api -> ../../.env).
const rootEnv = resolve(__dirname, "../../../.env");
if (existsSync(rootEnv)) {
  loadDotenv({ path: rootEnv });
} else {
  loadDotenv();
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function str(value: string | undefined, fallback: string): string {
  return value === undefined || value === "" ? fallback : value;
}

export type ProviderMode = "live" | "mock";

export interface AppConfig {
  nodeEnv: string;
  isTest: boolean;
  timezone: string;
  baseCurrency: string;
  api: {
    host: string;
    port: number;
    basePath: string;
    authToken: string | null;
  };
  mongo: {
    uri: string;
    dbName: string | undefined;
  };
  collection: {
    schedulerEnabled: boolean;
    intervals: {
      STOCK: number;
      CRYPTO: number;
      FX: number;
    };
    providerMode: {
      STOCK: ProviderMode;
      CRYPTO: ProviderMode;
      FX: ProviderMode;
    };
  };
  snapshot: {
    hourlyEnabled: boolean;
    dailyEnabled: boolean;
  };
  fx: {
    /**
     * Crypto quote currencies treated as pegged 1:1 to USD when resolving a
     * base-currency rate (e.g. USDT -> USD -> KRW). Documented assumption:
     * stablecoins are not fiat, so no FX provider publishes them directly.
     */
    stablecoinPegs: string[];
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = str(env.NODE_ENV, "development");
  return {
    nodeEnv,
    isTest: nodeEnv === "test",
    timezone: str(env.APP_TIMEZONE, DEFAULT_TIMEZONE),
    baseCurrency: str(env.BASE_CURRENCY, DEFAULT_BASE_CURRENCY),
    api: {
      host: str(env.API_HOST, "127.0.0.1"),
      port: num(env.API_PORT, 3001),
      basePath: str(env.API_BASE_PATH, "/api/v1"),
      authToken: env.API_AUTH_TOKEN ? env.API_AUTH_TOKEN : null,
    },
    mongo: {
      uri: str(env.MONGODB_URI, "mongodb://localhost:27017/jFolio"),
      dbName: env.MONGODB_DB,
    },
    collection: {
      schedulerEnabled: bool(env.COLLECTION_SCHEDULER_ENABLED, true),
      intervals: {
        STOCK: num(env.STOCK_COLLECTION_INTERVAL_SECONDS, 60),
        CRYPTO: num(env.CRYPTO_COLLECTION_INTERVAL_SECONDS, 10),
        FX: num(env.FX_COLLECTION_INTERVAL_SECONDS, 60),
      },
      providerMode: {
        STOCK: str(env.STOCK_PROVIDER, "live") as ProviderMode,
        CRYPTO: str(env.CRYPTO_PROVIDER, "live") as ProviderMode,
        FX: str(env.FX_PROVIDER, "live") as ProviderMode,
      },
    },
    snapshot: {
      hourlyEnabled: bool(env.HOURLY_SNAPSHOT_ENABLED, true),
      dailyEnabled: bool(env.DAILY_SNAPSHOT_ENABLED, true),
    },
    fx: {
      stablecoinPegs: str(env.STABLECOIN_USD_PEGS, "USDT,USDC,BUSD,DAI,TUSD,FDUSD")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    },
  };
}

export const config = loadConfig();
