/**
 * Instrument (asset master) helpers shared by the create form and the inline
 * editor. `ASSET_TYPES` mirrors `@jfolio/shared` but is declared locally so the
 * client bundle does not pull the Zod schemas in through the shared entrypoint.
 */

export const ASSET_TYPES = [
  "STOCK",
  "ETF",
  "CRYPTO",
  "FX",
  "BOND",
  "COMMODITY",
  "CASH",
] as const;

export interface ProviderLink {
  providerId: string;
  providerSymbol: string;
}

/**
 * Parse a compact provider list such as `"binance:BTCUSDT, yahoo:BTC-USD"`.
 * Blank input yields an empty list; a malformed entry throws so the form can
 * show a clear message instead of silently dropping the link.
 */
export function parseProviders(text: string): ProviderLink[] {
  const tokens = text
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  return tokens.map((token) => {
    const separator = token.indexOf(":");
    const providerId = separator > 0 ? token.slice(0, separator).trim() : "";
    const providerSymbol = separator > 0 ? token.slice(separator + 1).trim() : "";
    if (!providerId || !providerSymbol) {
      throw new Error(`공급자 형식이 올바르지 않습니다: "${token}" (예: binance:BTCUSDT)`);
    }
    return { providerId, providerSymbol };
  });
}

/** Inverse of {@link parseProviders}, suitable for a text input value. */
export function formatProviders(links: ProviderLink[]): string {
  return links.map((link) => `${link.providerId}:${link.providerSymbol}`).join(", ");
}
