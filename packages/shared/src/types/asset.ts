import type { ASSET_TYPES, DATA_INTERVALS } from "../constants/domain";

export type AssetType = (typeof ASSET_TYPES)[number];
export type DataInterval = (typeof DATA_INTERVALS)[number];

/**
 * FR-001 / FR-002: A tradable instrument. The internal `instrumentId` is
 * decoupled from the external provider symbol. An instrument links to at most
 * one provider; the API schema enforces the limit.
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
  /** Provider link (at most one per instrument). */
  providers: InstrumentProviderLink[];
  createdAt: Date;
  updatedAt: Date;
}

export type InstrumentInput = Omit<
  Instrument,
  "instrumentId" | "createdAt" | "updatedAt" | "isActive" | "isWatchlist"
> &
  Partial<Pick<Instrument, "instrumentId" | "isActive" | "isWatchlist">>;
