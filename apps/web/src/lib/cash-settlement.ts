/**
 * Helpers for the optional cash settlement of a trade.
 *
 * Cash is a separate `assetType=CASH` instrument: a SELL only changes the sold
 * instrument's position and a BUY only changes the bought position, so cash
 * moves only through a follow-up DEPOSIT (sale proceeds) or WITHDRAWAL
 * (purchase cost). These helpers prepare that entry, they never write one on
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
 * Gross cash paid for a purchase. Buy fees are part of the cost basis, so the
 * withdrawal must cover the fee as well as quantity × price. Rounded to avoid
 * binary-float artefacts in the prefilled form.
 */
export function grossPurchaseCost(
  quantity: number,
  price: number,
  fee = 0,
): number {
  if (!Number.isFinite(quantity) || !Number.isFinite(price)) return 0;
  const gross = quantity * price + (Number.isFinite(fee) ? fee : 0);
  if (!Number.isFinite(gross) || gross <= 0) return 0;
  return Number(gross.toFixed(8));
}

export interface CashSettlement {
  portfolioId: string;
  instrumentId: string;
  type: "DEPOSIT" | "WITHDRAWAL";
  /** ISO timestamp of the trade; the cash entry settles at the same moment. */
  timestamp: string;
  /** Cash amount: a CASH instrument is priced at 1. */
  quantity: number;
  price: number;
  fee: number;
  memo: string | null;
}

/**
 * Body for the DEPOSIT/WITHDRAWAL that settles a trade's cash side. The amount
 * rides in `quantity` because a CASH instrument is priced at 1.
 */
export function buildCashSettlement(input: {
  type: CashSettlement["type"];
  portfolioId: string;
  cashInstrumentId: string;
  amount: number;
  timestamp: string;
  memo?: string | null;
}): CashSettlement {
  return {
    portfolioId: input.portfolioId,
    instrumentId: input.cashInstrumentId,
    type: input.type,
    timestamp: input.timestamp,
    quantity: input.amount,
    price: 1,
    fee: 0,
    memo: input.memo ?? null,
  };
}

export function buildSaleDeposit(
  input: Omit<Parameters<typeof buildCashSettlement>[0], "type">,
): CashSettlement {
  return buildCashSettlement({ ...input, type: "DEPOSIT" });
}

export function buildPurchaseWithdrawal(
  input: Omit<Parameters<typeof buildCashSettlement>[0], "type">,
): CashSettlement {
  return buildCashSettlement({ ...input, type: "WITHDRAWAL" });
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
