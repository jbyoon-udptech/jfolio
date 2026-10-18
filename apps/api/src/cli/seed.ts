import type { InstrumentInput, TransactionInput } from "@jfolio/shared";
import { config } from "../config";
import { createContainer } from "../container";
import { connectMongo, disconnectMongo } from "../db/mongo";
import { createMongoRepositories } from "../repositories/mongo";
import { startScheduler } from "../scheduler";

/**
 * Seeds a small, realistic instrument master plus a demo portfolio so the
 * dashboard has data on a fresh install. Idempotent: instruments are upserted by
 * natural key and transactions are only created when the portfolio is empty.
 */
const INSTRUMENTS: InstrumentInput[] = [
  {
    symbol: "BTCUSDT",
    name: "Bitcoin / TetherUS",
    assetType: "CRYPTO",
    market: "BINANCE",
    currency: "USDT",
    providers: [{ providerId: "binance", providerSymbol: "BTCUSDT" }],
  },
  {
    symbol: "ETHUSDT",
    name: "Ethereum / TetherUS",
    assetType: "CRYPTO",
    market: "BINANCE",
    currency: "USDT",
    providers: [{ providerId: "binance", providerSymbol: "ETHUSDT" }],
  },
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    assetType: "STOCK",
    market: "NASDAQ",
    currency: "USD",
    providers: [{ providerId: "yahoo", providerSymbol: "AAPL" }],
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corporation",
    assetType: "STOCK",
    market: "NASDAQ",
    currency: "USD",
    providers: [{ providerId: "yahoo", providerSymbol: "MSFT" }],
  },
  {
    symbol: "005930",
    name: "삼성전자",
    assetType: "STOCK",
    market: "KRX",
    currency: "KRW",
    providers: [{ providerId: "yahoo", providerSymbol: "005930.KS" }],
  },
  {
    symbol: "SPY",
    name: "SPDR S&P 500 ETF Trust",
    assetType: "ETF",
    market: "NYSEARCA",
    currency: "USD",
    providers: [{ providerId: "yahoo", providerSymbol: "SPY" }],
  },
  {
    symbol: "USD/KRW",
    name: "US Dollar / Korean Won",
    assetType: "FX",
    market: "FX",
    currency: "KRW",
    providers: [{ providerId: "frankfurter", providerSymbol: "USD" }],
  },
  {
    symbol: "USD",
    name: "US Dollar Cash",
    assetType: "CASH",
    market: "CASH",
    currency: "USD",
    providers: [],
  },
  {
    symbol: "KRW",
    name: "Korean Won Cash",
    assetType: "CASH",
    market: "CASH",
    currency: "KRW",
    providers: [],
  },
  {
    symbol: "EUR",
    name: "Euro Cash",
    assetType: "CASH",
    market: "CASH",
    currency: "EUR",
    providers: [],
  },
  // --- Korean equities (KRX). providerSymbol is the bare 6-digit code; the
  // Yahoo provider derives the KOSPI/KOSDAQ suffix itself. ---
  {
    symbol: "000660",
    name: "SK하이닉스",
    assetType: "STOCK",
    market: "KRX",
    currency: "KRW",
    providers: [{ providerId: "yahoo", providerSymbol: "000660" }],
  },
  {
    symbol: "373220",
    name: "LG에너지솔루션",
    assetType: "STOCK",
    market: "KRX",
    currency: "KRW",
    providers: [{ providerId: "yahoo", providerSymbol: "373220" }],
  },
  {
    symbol: "207940",
    name: "삼성바이오로직스",
    assetType: "STOCK",
    market: "KRX",
    currency: "KRW",
    providers: [{ providerId: "yahoo", providerSymbol: "207940" }],
  },
  {
    symbol: "005380",
    name: "현대차",
    assetType: "STOCK",
    market: "KRX",
    currency: "KRW",
    providers: [{ providerId: "yahoo", providerSymbol: "005380" }],
  },
  {
    symbol: "000270",
    name: "기아",
    assetType: "STOCK",
    market: "KRX",
    currency: "KRW",
    providers: [{ providerId: "yahoo", providerSymbol: "000270" }],
  },
  {
    symbol: "035420",
    name: "NAVER",
    assetType: "STOCK",
    market: "KRX",
    currency: "KRW",
    providers: [{ providerId: "yahoo", providerSymbol: "035420" }],
  },
  {
    symbol: "035720",
    name: "카카오",
    assetType: "STOCK",
    market: "KRX",
    currency: "KRW",
    providers: [{ providerId: "yahoo", providerSymbol: "035720" }],
  },
  // --- Korean ETFs (KRX) ---
  {
    symbol: "069500",
    name: "KODEX 200",
    assetType: "ETF",
    market: "KRX",
    currency: "KRW",
    providers: [{ providerId: "yahoo", providerSymbol: "069500" }],
  },
  {
    symbol: "102110",
    name: "TIGER 200",
    assetType: "ETF",
    market: "KRX",
    currency: "KRW",
    providers: [{ providerId: "yahoo", providerSymbol: "102110" }],
  },
  {
    symbol: "360750",
    name: "TIGER 미국S&P500",
    assetType: "ETF",
    market: "KRX",
    currency: "KRW",
    providers: [{ providerId: "yahoo", providerSymbol: "360750" }],
  },
  {
    symbol: "133690",
    name: "TIGER 미국나스닥100",
    assetType: "ETF",
    market: "KRX",
    currency: "KRW",
    providers: [{ providerId: "yahoo", providerSymbol: "133690" }],
  },
  // --- US equities ---
  {
    symbol: "NVDA",
    name: "NVIDIA Corporation",
    assetType: "STOCK",
    market: "NASDAQ",
    currency: "USD",
    providers: [{ providerId: "yahoo", providerSymbol: "NVDA" }],
  },
  {
    symbol: "GOOGL",
    name: "Alphabet Inc. Class A",
    assetType: "STOCK",
    market: "NASDAQ",
    currency: "USD",
    providers: [{ providerId: "yahoo", providerSymbol: "GOOGL" }],
  },
  {
    symbol: "AMZN",
    name: "Amazon.com, Inc.",
    assetType: "STOCK",
    market: "NASDAQ",
    currency: "USD",
    providers: [{ providerId: "yahoo", providerSymbol: "AMZN" }],
  },
  {
    symbol: "TSLA",
    name: "Tesla, Inc.",
    assetType: "STOCK",
    market: "NASDAQ",
    currency: "USD",
    providers: [{ providerId: "yahoo", providerSymbol: "TSLA" }],
  },
  {
    symbol: "META",
    name: "Meta Platforms, Inc.",
    assetType: "STOCK",
    market: "NASDAQ",
    currency: "USD",
    providers: [{ providerId: "yahoo", providerSymbol: "META" }],
  },
  // --- US ETFs (bond/commodity exposure via ETFs; BOND/COMMODITY have no provider) ---
  {
    symbol: "QQQ",
    name: "Invesco QQQ Trust",
    assetType: "ETF",
    market: "NASDAQ",
    currency: "USD",
    providers: [{ providerId: "yahoo", providerSymbol: "QQQ" }],
  },
  {
    symbol: "VOO",
    name: "Vanguard S&P 500 ETF",
    assetType: "ETF",
    market: "NYSEARCA",
    currency: "USD",
    providers: [{ providerId: "yahoo", providerSymbol: "VOO" }],
  },
  {
    symbol: "GLD",
    name: "SPDR Gold Shares",
    assetType: "ETF",
    market: "NYSEARCA",
    currency: "USD",
    providers: [{ providerId: "yahoo", providerSymbol: "GLD" }],
  },
  {
    symbol: "TLT",
    name: "iShares 20+ Year Treasury Bond ETF",
    assetType: "ETF",
    market: "NASDAQ",
    currency: "USD",
    providers: [{ providerId: "yahoo", providerSymbol: "TLT" }],
  },
  // --- Crypto ---
  {
    symbol: "SOLUSDT",
    name: "Solana / TetherUS",
    assetType: "CRYPTO",
    market: "BINANCE",
    currency: "USDT",
    providers: [{ providerId: "binance", providerSymbol: "SOLUSDT" }],
  },
  {
    symbol: "XRPUSDT",
    name: "XRP / TetherUS",
    assetType: "CRYPTO",
    market: "BINANCE",
    currency: "USDT",
    providers: [{ providerId: "binance", providerSymbol: "XRPUSDT" }],
  },
  {
    symbol: "BNBUSDT",
    name: "BNB / TetherUS",
    assetType: "CRYPTO",
    market: "BINANCE",
    currency: "USDT",
    providers: [{ providerId: "binance", providerSymbol: "BNBUSDT" }],
  },
  // --- FX (symbol = BASE/QUOTE, providerSymbol = base currency) ---
  {
    symbol: "EUR/KRW",
    name: "Euro / Korean Won",
    assetType: "FX",
    market: "FX",
    currency: "KRW",
    providers: [{ providerId: "frankfurter", providerSymbol: "EUR" }],
  },
  {
    symbol: "JPY/KRW",
    name: "Japanese Yen / Korean Won",
    assetType: "FX",
    market: "FX",
    currency: "KRW",
    providers: [{ providerId: "frankfurter", providerSymbol: "JPY" }],
  },
];

async function main(): Promise<void> {
  const db = await connectMongo({ uri: config.mongo.uri, dbName: config.mongo.dbName });
  const container = createContainer(createMongoRepositories(db), config);

  const bySymbol = new Map<string, string>();
  for (const input of INSTRUMENTS) {
    const instrument = await container.instruments.upsert(input);
    bySymbol.set(instrument.symbol, instrument.instrumentId);
    // eslint-disable-next-line no-console
    console.log(`[seed] instrument ${instrument.symbol} -> ${instrument.instrumentId}`);
  }

  const portfolio = await container.portfolios.ensureDefault();
  const existing = await container.transactions.list({ portfolioId: portfolio.portfolioId, limit: 1 });

  if (existing.total === 0) {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const demoTrades: TransactionInput[] = [
      { portfolioId: portfolio.portfolioId, instrumentId: req(bySymbol, "KRW"), type: "DEPOSIT", timestamp: new Date(now - 30 * day), quantity: 50_000_000, price: 1, currency: "KRW", fee: 0 },
      { portfolioId: portfolio.portfolioId, instrumentId: req(bySymbol, "USD"), type: "DEPOSIT", timestamp: new Date(now - 30 * day), quantity: 20_000, price: 1, currency: "USD", fee: 0 },
      { portfolioId: portfolio.portfolioId, instrumentId: req(bySymbol, "BTCUSDT"), type: "BUY", timestamp: new Date(now - 20 * day), quantity: 0.15, price: 62_000, currency: "USDT", fee: 10 },
      { portfolioId: portfolio.portfolioId, instrumentId: req(bySymbol, "AAPL"), type: "BUY", timestamp: new Date(now - 18 * day), quantity: 30, price: 190, currency: "USD", fee: 1 },
      { portfolioId: portfolio.portfolioId, instrumentId: req(bySymbol, "005930"), type: "BUY", timestamp: new Date(now - 10 * day), quantity: 100, price: 72_000, currency: "KRW", fee: 1_500 },
      { portfolioId: portfolio.portfolioId, instrumentId: req(bySymbol, "NVDA"), type: "BUY", timestamp: new Date(now - 15 * day), quantity: 20, price: 130, currency: "USD", fee: 1 },
      { portfolioId: portfolio.portfolioId, instrumentId: req(bySymbol, "QQQ"), type: "BUY", timestamp: new Date(now - 15 * day), quantity: 10, price: 480, currency: "USD", fee: 1 },
      { portfolioId: portfolio.portfolioId, instrumentId: req(bySymbol, "SOLUSDT"), type: "BUY", timestamp: new Date(now - 12 * day), quantity: 20, price: 150, currency: "USDT", fee: 0.1 },
      { portfolioId: portfolio.portfolioId, instrumentId: req(bySymbol, "000660"), type: "BUY", timestamp: new Date(now - 8 * day), quantity: 30, price: 180_000, currency: "KRW", fee: 300 },
    ];
    for (const trade of demoTrades) {
      await container.transactions.create(trade);
    }
    // eslint-disable-next-line no-console
    console.log(`[seed] created ${demoTrades.length} demo transactions`);
  } else {
    // eslint-disable-next-line no-console
    console.log("[seed] portfolio already has transactions, skipping demo data");
  }

  // Best-effort first collection so the dashboard is not empty.
  const scheduler = startScheduler(container, config);
  try {
    const result = await scheduler.runCollection();
    // eslint-disable-next-line no-console
    console.log(
      `[seed] collection: inserted=${result.inserted} duplicates=${result.duplicates} rejected=${result.rejected} signals=${result.signalsTriggered}`,
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("[seed] initial collection failed (providers may be offline):", error);
  } finally {
    scheduler.stop();
  }

  await disconnectMongo();
}

function req(map: Map<string, string>, symbol: string): string {
  const id = map.get(symbol);
  if (!id) throw new Error(`Seed instrument ${symbol} missing`);
  return id;
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[seed] failed:", error);
  process.exit(1);
});
