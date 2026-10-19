import type { Instrument, InstrumentInput, MarketQuote, Portfolio } from "@jfolio/shared";
import { loadConfig, type AppConfig } from "../src/config/env";
import { createContainer, type Container } from "../src/container";
import { createMemoryRepositories } from "../src/repositories/memory";
import type { Repositories } from "../src/repositories/types";

/** Deterministic clock used across tests (all providers are mocked). */
export const FIXED_NOW = new Date("2026-10-16T12:00:00.000Z");

export interface TestContext {
  repos: Repositories;
  config: AppConfig;
  container: Container;
  now: Date;
}

export function createTestConfig(overrides: NodeJS.ProcessEnv = {}): AppConfig {
  return loadConfig({
    NODE_ENV: "test",
    STOCK_PROVIDER: "mock",
    CRYPTO_PROVIDER: "mock",
    FX_PROVIDER: "mock",
    COLLECTION_SCHEDULER_ENABLED: "false",
    API_AUTH_TOKEN: "",
    // Existing route tests predate user login and call the API anonymously.
    AUTH_REQUIRED: "false",
    AUTH_LOCAL_ENABLED: "true",
    AUTH_BCRYPT_ROUNDS: "4",
    SESSION_STORE: "memory",
    ...overrides,
  });
}

export function createTestContext(now: Date = FIXED_NOW, env: NodeJS.ProcessEnv = {}): TestContext {
  const repos = createMemoryRepositories();
  const config = createTestConfig(env);
  const container = createContainer(repos, config, { now: () => now });
  return { repos, config, container, now };
}

/** Create an instrument through the service so validation/natural keys apply. */
export async function createInstrument(
  container: Container,
  input: InstrumentInput,
): Promise<Instrument> {
  return container.instruments.create(input);
}

export async function createPortfolio(
  container: Container,
  baseCurrency = "KRW",
  name = "Test Portfolio",
): Promise<Portfolio> {
  return container.portfolios.create({ name, baseCurrency });
}

export function makeQuote(
  instrument: Instrument,
  price: number,
  options: { timestamp?: Date; interval?: MarketQuote["interval"]; providerId?: string } = {},
): MarketQuote {
  const timestamp = options.timestamp ?? FIXED_NOW;
  return {
    instrumentId: instrument.instrumentId,
    providerId: options.providerId ?? "test",
    interval: options.interval ?? "1m",
    timestamp,
    receivedAt: timestamp,
    price,
    currency: instrument.currency,
    close: price,
    isFinal: true,
  };
}
