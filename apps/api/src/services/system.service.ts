import type { CollectionJob, DataStatus, ProviderState } from "@jfolio/shared";
import type { MarketDataProvider } from "../providers/market-data.provider";
import type { ProviderRegistry } from "../providers/registry";
import type { Repositories } from "../repositories/types";

export interface ProviderStatusView {
  providerId: string;
  displayName: string;
  assetTypes: string[];
  capabilities: MarketDataProvider["capabilities"];
  state: ProviderState | null;
}

export interface SystemDataStatus {
  status: DataStatus;
  lastUpdatedAt: Date | null;
  latestQuoteAt: Date | null;
  latestCollectionAt: Date | null;
  providers: ProviderState[];
  recentJobs: CollectionJob[];
}

/**
 * FR-014 / NFR-005: Operational view over collection health. Reads only stored
 * state so it never depends on a live external call.
 */
export class SystemService {
  constructor(
    private readonly repos: Repositories,
    private readonly registry: ProviderRegistry,
  ) {}

  async getDataStatus(): Promise<SystemDataStatus> {
    const [providers, recentJobs] = await Promise.all([
      this.repos.providerStates.list(),
      this.repos.collectionJobs.list({ limit: 10 }),
    ]);

    const latestQuoteAt = providers.reduce<Date | null>((latest, state) => {
      if (!state.lastDataTimestamp) return latest;
      if (!latest || state.lastDataTimestamp > latest) return state.lastDataTimestamp;
      return latest;
    }, null);

    const latestCollectionAt = providers.reduce<Date | null>((latest, state) => {
      if (!state.lastRunAt) return latest;
      if (!latest || state.lastRunAt > latest) return state.lastRunAt;
      return latest;
    }, null);

    return {
      status: computeStatus(providers),
      lastUpdatedAt: latestQuoteAt ?? latestCollectionAt,
      latestQuoteAt,
      latestCollectionAt,
      providers,
      recentJobs,
    };
  }

  async getProviders(): Promise<ProviderStatusView[]> {
    const states = await this.repos.providerStates.list();
    const byId = new Map(states.map((s) => [s.providerId, s] as const));
    return this.registry.list().map((provider) => ({
      providerId: provider.providerId,
      displayName: provider.displayName,
      assetTypes: provider.assetTypes,
      capabilities: provider.capabilities,
      state: byId.get(provider.providerId) ?? null,
    }));
  }
}

function computeStatus(providers: ProviderState[]): DataStatus {
  if (providers.length === 0) return "NO_DATA";
  if (providers.some((p) => p.consecutiveFailures >= 3)) return "ERROR";
  if (providers.some((p) => p.failureCount > 0)) return "DELAYED";
  if (providers.every((p) => p.successCount === 0)) return "NO_DATA";
  return "NORMAL";
}
