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
export type SessionStoreMode = "memory" | "mongo";
export type SameSiteMode = "lax" | "strict" | "none";

export interface AuthConfig {
  /** When true, every /api/v1 call requires a session or the API token. */
  required: boolean;
  localEnabled: boolean;
  /** Reserved for Phase 2. No Google routes are implemented yet. */
  googleEnabled: boolean;
  session: {
    store: SessionStoreMode;
    secret: string;
    cookieName: string;
    csrfCookieName: string;
    maxAgeMs: number;
    secure: boolean;
    sameSite: SameSiteMode;
    /** Trust X-Forwarded-Proto from the reverse proxy (Next.js). */
    trustProxy: boolean;
  };
  bcryptRounds: number;
  loginRateLimit: {
    windowMs: number;
    max: number;
  };
  google: {
    clientId: string | null;
    clientSecret: string | null;
    redirectUri: string | null;
  };
}

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
  auth: AuthConfig;
}

function parseSameSite(value: string | undefined, fallback: SameSiteMode): SameSiteMode {
  const normalized = (value ?? "").toLowerCase();
  return normalized === "lax" || normalized === "strict" || normalized === "none"
    ? normalized
    : fallback;
}

function sessionSecure(
  value: string | undefined,
  nodeEnv: string,
  sameSite: SameSiteMode,
): boolean {
  if (value === "auto") return nodeEnv === "production";
  const secure = bool(value, nodeEnv === "production");
  // Browsers reject SameSite=None cookies that are not Secure.
  if (sameSite === "none" && !secure) {
    throw new Error("SESSION_COOKIE_SAMESITE=none requires SESSION_COOKIE_SECURE=true");
  }
  return secure;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = str(env.NODE_ENV, "development");
  const authRequired = bool(env.AUTH_REQUIRED, nodeEnv !== "test");
  const localEnabled = bool(env.AUTH_LOCAL_ENABLED, true);
  const googleEnabled = bool(env.AUTH_GOOGLE_ENABLED, false);
  const authEnabled = authRequired || localEnabled || googleEnabled;

  const sessionSecret = str(
    env.SESSION_SECRET,
    nodeEnv === "production" ? "" : "jfolio-development-session-secret-change-me",
  );
  if (authEnabled && !sessionSecret) {
    throw new Error(
      "SESSION_SECRET is required when authentication is enabled (set a random value of at least 32 characters)",
    );
  }
  if (nodeEnv === "production" && authEnabled && sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters in production");
  }

  const sessionStore = str(
    env.SESSION_STORE,
    nodeEnv === "test" ? "memory" : "mongo",
  ) as SessionStoreMode;
  if (sessionStore !== "memory" && sessionStore !== "mongo") {
    throw new Error("SESSION_STORE must be either 'memory' or 'mongo'");
  }
  if (nodeEnv === "production" && authEnabled && sessionStore === "memory") {
    throw new Error("SESSION_STORE=memory is not allowed in production");
  }

  const sameSite = parseSameSite(env.SESSION_COOKIE_SAMESITE, "lax");
  const secure = sessionSecure(env.SESSION_COOKIE_SECURE, nodeEnv, sameSite);

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
    auth: {
      required: authRequired,
      localEnabled,
      googleEnabled,
      session: {
        store: sessionStore,
        secret: sessionSecret,
        cookieName: str(env.SESSION_COOKIE_NAME, "jfolio.sid"),
        csrfCookieName: str(env.AUTH_CSRF_COOKIE_NAME, "jfolio.csrf"),
        maxAgeMs: num(env.SESSION_MAX_AGE_MS, 7 * 24 * 60 * 60 * 1000),
        secure,
        sameSite,
        // Secure cookies only work behind TLS. Express is normally reached
        // through the Next.js proxy, so trust its X-Forwarded-Proto header.
        trustProxy: bool(env.SESSION_TRUST_PROXY, secure),
      },
      bcryptRounds: num(env.AUTH_BCRYPT_ROUNDS, 12),
      loginRateLimit: {
        windowMs: num(env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
        max: num(env.AUTH_LOGIN_RATE_LIMIT_MAX, 10),
      },
      google: {
        clientId: env.GOOGLE_CLIENT_ID ? env.GOOGLE_CLIENT_ID : null,
        clientSecret: env.GOOGLE_CLIENT_SECRET ? env.GOOGLE_CLIENT_SECRET : null,
        redirectUri: env.GOOGLE_REDIRECT_URI ? env.GOOGLE_REDIRECT_URI : null,
      },
    },
  };
}

export const config = loadConfig();
