import type { AppConfig } from "./config";
import { AuthService } from "./auth/auth.service";
import { createProviderRegistry, type ProviderRegistry } from "./providers/registry";
import type { Repositories } from "./repositories/types";
import { CollectionService } from "./services/collection.service";
import { DashboardService } from "./services/dashboard.service";
import { HistoricalBackfillService } from "./services/historical-backfill.service";
import { InstrumentService } from "./services/instrument.service";
import { MarketDataService } from "./services/market-data.service";
import { PortfolioService } from "./services/portfolio.service";
import { PositionService } from "./services/position.service";
import { SignalService } from "./services/signal.service";
import { SnapshotService } from "./services/snapshot.service";
import { SystemService } from "./services/system.service";
import { TransactionService } from "./services/transaction.service";
import { ValuationService } from "./services/valuation.service";

export interface Container {
  config: AppConfig;
  repos: Repositories;
  providers: ProviderRegistry;
  auth: AuthService;
  instruments: InstrumentService;
  marketData: MarketDataService;
  positions: PositionService;
  portfolios: PortfolioService;
  transactions: TransactionService;
  valuation: ValuationService;
  signals: SignalService;
  snapshots: SnapshotService;
  collection: CollectionService;
  backfill: HistoricalBackfillService;
  dashboard: DashboardService;
  system: SystemService;
}

export interface ContainerOverrides {
  now?: () => Date;
}

export function createContainer(
  repos: Repositories,
  config: AppConfig,
  overrides: ContainerOverrides = {},
): Container {
  const now = overrides.now ?? (() => new Date());
  const providers = createProviderRegistry(config);
  const marketData = new MarketDataService(repos, now, new Set(config.fx.stablecoinPegs));
  const valuation = new ValuationService(repos, marketData);
  const signals = new SignalService(repos, now);
  const collection = new CollectionService(repos, providers, marketData, signals, now);
  const backfill = new HistoricalBackfillService(
    repos,
    providers,
    collection,
    config.collection.historyBackfill.days,
    now,
  );

  return {
    config,
    repos,
    providers,
    auth: new AuthService(repos.users, config),
    instruments: new InstrumentService(repos),
    marketData,
    positions: new PositionService(repos),
    portfolios: new PortfolioService(repos),
    transactions: new TransactionService(repos),
    valuation,
    signals,
    snapshots: new SnapshotService(repos, valuation),
    collection,
    backfill,
    dashboard: new DashboardService(repos, valuation, now),
    system: new SystemService(repos, providers, config.collection),
  };
}
