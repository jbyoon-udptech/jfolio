import type { ASSET_TYPES, DATA_INTERVALS } from "../constants/domain";

export type AssetType = (typeof ASSET_TYPES)[number];
export type DataInterval = (typeof DATA_INTERVALS)[number];

/**
 * FR-001 / FR-002: A tradable instrument. The internal `instrumentId` is
 * decoupled from any external provider symbol so the same instrument can be
 * sourced from multiple providers.
 */
export interface InstrumentProviderLink {
  providerId: string;
  providerSymbol: string;
}

export interface Instrument {
  instrumentId: string;
  symbol: string;
  name: string;
  assetType: AssetType;
  market: string;
  currency: string;
  /** Whether market data collection is enabled for this instrument. */
  isActive: boolean;
  /** FR-003: watchlist flag, independent of ownership. */
  isWatchlist: boolean;
  providers: InstrumentProviderLink[];
  createdAt: Date;
  updatedAt: Date;
}

export type InstrumentInput = Omit<
  Instrument,
  "instrumentId" | "createdAt" | "updatedAt" | "isActive" | "isWatchlist"
> &
  Partial<Pick<Instrument, "instrumentId" | "isActive" | "isWatchlist">>;
