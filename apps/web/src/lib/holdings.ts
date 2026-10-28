/** Preferred display order for holding currencies, then any others by code. */
export const HOLDING_CURRENCY_ORDER = ["KRW", "USD", "USDT"] as const;

export interface HoldingCurrencyGroup<T> {
  currency: string;
  items: T[];
}

function currencyRank(currency: string): number {
  const index = (HOLDING_CURRENCY_ORDER as readonly string[]).indexOf(currency);
  return index === -1 ? HOLDING_CURRENCY_ORDER.length : index;
}

/** Split holdings into currency groups, preserving rows within each group. */
export function groupHoldingsByCurrency<T extends { currency: string }>(
  holdings: readonly T[],
): Array<HoldingCurrencyGroup<T>> {
  const groups = new Map<string, T[]>();
  for (const holding of holdings) {
    const currency = holding.currency.trim() || "—";
    const group = groups.get(currency);
    if (group) group.push(holding);
    else groups.set(currency, [holding]);
  }

  return [...groups.entries()]
    .map(([currency, items]) => ({ currency, items }))
    .sort(
      (a, b) =>
        currencyRank(a.currency) - currencyRank(b.currency) ||
        a.currency.localeCompare(b.currency),
    );
}
