/**
 * Helpers for the optional "settle a sale into cash" prompt.
 *
 * Cash is a separate `assetType=CASH` instrument: a SELL only changes the sold
 * instrument's position, so the proceeds reach a cash balance only through a
 * follow-up DEPOSIT. These helpers prepare that DEPOSIT, they never write one on
 * their own.
 */

export interface CashSettlementOption {
  value: string;
  label: string;
  /** Undefined on options that are not instruments (e.g. portfolios). */
  currency?: string;
  assetType?: string;
}

/**
 * Net cash received from a sale. The fee is already deducted from realised P&L,
 * so the cash deposit must use the net amount rather than the gross proceeds.
 * Rounded to avoid binary-float artefacts in the prefilled form.
 */
export function netSaleProceeds(
  quantity: number,
  price: number,
  fee = 0,
): number {
  if (!Number.isFinite(quantity) || !Number.isFinite(price)) return 0;
  const net = quantity * price - (Number.isFinite(fee) ? fee : 0);
  if (!Number.isFinite(net) || net <= 0) return 0;
  return Number(net.toFixed(8));
}

/**
 * Cash assets that can receive the sale proceeds. Currency matching is
 * case-insensitive because instruments may store lower-case codes.
 */
export function findCashOptions<T extends CashSettlementOption>(
  options: readonly T[],
  currency: string,
): T[] {
  const wanted = currency.trim().toUpperCase();
  if (!wanted) return [];
  return options.filter(
    (option) =>
      option.assetType === "CASH" &&
      option.currency?.trim().toUpperCase() === wanted,
  );
}
