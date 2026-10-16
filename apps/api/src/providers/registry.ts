import type { AssetType, Instrument } from "@jfolio/shared";
import type { AppConfig } from "../config";
import { BinanceCryptoProvider } from "./crypto/binance.provider";
import { FrankfurterFxProvider } from "./fx/frankfurter.provider";
import type { MarketDataProvider } from "./market-data.provider";
import { MockMarketDataProvider } from "./mock/mock.provider";
import { YahooStockProvider } from "./stocks/yahoo.provider";

export interface ProviderRegistry {
  get(providerId: string): MarketDataProvider | undefined;
  list(): MarketDataProvider[];
  /** Provider used for a given instrument, honouring the configured mode. */
  forInstrument(instrument: Instrument): MarketDataProvider | undefined;
  forAssetType(assetType: AssetType): MarketDataProvider | undefined;
  /** Instruments whose asset type has no usable provider are skipped. */
  supportsAssetType(assetType: AssetType): boolean;
}

export function createProviderRegistry(config: AppConfig): ProviderRegistry {
  const mock = new MockMarketDataProvider({ providerId: "mock" });
  const binance = new BinanceCryptoProvider();
  const yahoo = new YahooStockProvider();
  const frankfurter = new FrankfurterFxProvider();

  const all: MarketDataProvider[] = [mock, binance, yahoo, frankfurter];
  const byId = new Map<string, MarketDataProvider>(
    all.map((p) => [p.providerId, p] as const),
  );

  const modeDefault: Partial<Record<AssetType, MarketDataProvider>> = {
    STOCK: config.collection.providerMode.STOCK === "mock" ? mock : yahoo,
    ETF: config.collection.providerMode.STOCK === "mock" ? mock : yahoo,
    CRYPTO: config.collection.providerMode.CRYPTO === "mock" ? mock : binance,
    FX: config.collection.providerMode.FX === "mock" ? mock : frankfurter,
  };

  return {
    get: (providerId) => byId.get(providerId),
    list: () => all,
    forAssetType: (assetType) => modeDefault[assetType],
    forInstrument: (instrument) => {
      const preferred = modeDefault[instrument.assetType];
      if (preferred) return preferred;
      // Fall back to an explicitly linked provider.
      for (const link of instrument.providers) {
        const provider = byId.get(link.providerId);
        if (provider && provider.assetTypes.includes(instrument.assetType)) return provider;
      }
      return undefined;
    },
    supportsAssetType: (assetType) => modeDefault[assetType] !== undefined,
  };
}
