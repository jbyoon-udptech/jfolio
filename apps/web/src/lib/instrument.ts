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

/** Markets offered by the asset master form. */
export const MARKET_OPTIONS = [
  "KRX",
  "KOSPI",
  "KOSDAQ",
  "NASDAQ",
  "NYSE",
  "NYSEARCA",
  "AMEX",
  "BINANCE",
  "FX",
  "CASH",
] as const;

/**
 * Build the market select options. An existing instrument may carry a market
 * outside the standard list; keep it selectable so editing another field does
 * not silently change it.
 */
export function marketOptions(current?: string): string[] {
  const market = current?.trim();
  if (
    !market ||
    (MARKET_OPTIONS as readonly string[]).includes(market)
  ) {
    return [...MARKET_OPTIONS];
  }
  return [market, ...MARKET_OPTIONS];
}

/** Currencies offered by the asset master form. */
export const CURRENCY_CODES = ["KRW", "USD", "JPY", "EUR", "USDT"] as const;

/**
 * Build the currency select options. An existing instrument may carry a code
 * outside the standard list; keep it selectable so editing another field does
 * not silently change the currency.
 */
export function currencyOptions(current?: string): string[] {
  const code = current?.trim().toUpperCase();
  if (!code || (CURRENCY_CODES as readonly string[]).includes(code)) {
    return [...CURRENCY_CODES];
  }
  return [code, ...CURRENCY_CODES];
}

export interface CurrencyGroup<T> {
  currency: string;
  items: T[];
}

const CURRENCY_ORDER = new Map<string, number>(
  CURRENCY_CODES.map((code, index): [string, number] => [code, index]),
);

/**
 * Group transaction assets by trading currency so the asset select can render
 * a currency header before each group. Standard currencies follow the same
 * order as the asset form; unknown codes follow alphabetically.
 */
export function groupByCurrency<T extends { currency: string }>(
  items: T[],
): CurrencyGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const currency = item.currency.trim().toUpperCase() || "기타";
    const group = groups.get(currency);
    if (group) {
      group.push(item);
    } else {
      groups.set(currency, [item]);
    }
  }
  return [...groups.entries()]
    .sort(([a], [b]) => compareCurrency(a, b))
    .map(([currency, groupItems]) => ({ currency, items: groupItems }));
}

function compareCurrency(a: string, b: string): number {
  const aRank = CURRENCY_ORDER.get(a);
  const bRank = CURRENCY_ORDER.get(b);
  if (aRank !== undefined || bRank !== undefined) {
    return (
      (aRank ?? CURRENCY_CODES.length) - (bRank ?? CURRENCY_CODES.length)
    );
  }
  return a.localeCompare(b);
}

export interface ProviderLink {
  providerId: string;
  providerSymbol: string;
}

export interface ProviderOption {
  providerId: string;
  displayName: string;
}

/**
 * Providers offered by the asset master form. This mirrors the API provider
 * registry; `mock` is intentionally omitted because it is a development-only
 * source. Existing links to it remain editable through {@link providerOptions}.
 */
export const PROVIDER_OPTIONS: ProviderOption[] = [
  { providerId: "yahoo", displayName: "Yahoo Finance" },
  { providerId: "binance", displayName: "Binance" },
  { providerId: "frankfurter", displayName: "Frankfurter / ECB" },
];

/**
 * Build the provider select options. An existing instrument may reference a
 * provider outside the standard list (for example a legacy `mock` link); keep
 * it selectable so editing another field does not silently drop the link.
 */
export function providerOptions(current?: string): ProviderOption[] {
  const providerId = current?.trim();
  if (
    !providerId ||
    PROVIDER_OPTIONS.some((option) => option.providerId === providerId)
  ) {
    return [...PROVIDER_OPTIONS];
  }
  return [{ providerId, displayName: "사용자 지정" }, ...PROVIDER_OPTIONS];
}

/**
 * Validate and normalize the single provider link before submitting. An
 * unselected provider yields `null`; a partially filled link is rejected.
 */
export function normalizeProviderLink(
  providerId: string,
  providerSymbol: string,
): ProviderLink | null {
  const id = providerId.trim();
  const symbol = providerSymbol.trim();
  if (!id && !symbol) return null;
  if (!id || !symbol) {
    throw new Error("공급자와 공급자 심볼을 모두 입력하세요.");
  }
  return { providerId: id, providerSymbol: symbol };
}

/**
 * Default the provider symbol to the asset code until the user overrides it.
 * The current provider symbol is considered a manual override once it no
 * longer mirrors the previous code.
 */
export function defaultProviderSymbol(
  symbol: string,
  currentProviderSymbol: string,
  previousSymbol: string,
): string {
  return !currentProviderSymbol || currentProviderSymbol === previousSymbol
    ? symbol
    : currentProviderSymbol;
}
