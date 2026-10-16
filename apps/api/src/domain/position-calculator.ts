import type { Position, RealizedPnl, Transaction } from "@jfolio/shared";
import Decimal from "decimal.js";
import { dec } from "./money";

export interface PositionCalculationOptions {
  /** Only apply transactions with timestamp <= asOf. */
  asOf?: Date;
}

export interface PositionCalculation {
  positions: Position[];
  realized: RealizedPnl[];
  /** Non-fatal issues encountered while reconstructing (e.g. oversell). */
  warnings: string[];
}

interface MutablePosition {
  quantity: Decimal;
  costBasis: Decimal;
  currency: string;
  firstAcquiredAt: Date | null;
}

interface MutableRealized {
  currency: string;
  realizedPnl: Decimal;
  dividends: Decimal;
  interest: Decimal;
  fees: Decimal;
}

function sortTransactions(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => {
    const byTime = a.timestamp.getTime() - b.timestamp.getTime();
    if (byTime !== 0) return byTime;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

/**
 * FR-031 / FR-032 / FR-044: Reconstruct holdings from the transaction ledger
 * using the moving-average cost method (documented assumption; SPEC FR-044).
 *
 * `quantity` semantics per transaction type are documented on the `Transaction`
 * type in @jfolio/shared.
 */
export function calculatePositions(
  portfolioId: string,
  transactions: Transaction[],
  options: PositionCalculationOptions = {},
): PositionCalculation {
  const positions = new Map<string, MutablePosition>();
  const realized = new Map<string, MutableRealized>();
  const warnings: string[] = [];

  const ensurePosition = (instrumentId: string, currency: string): MutablePosition => {
    let pos = positions.get(instrumentId);
    if (!pos) {
      pos = { quantity: dec(0), costBasis: dec(0), currency, firstAcquiredAt: null };
      positions.set(instrumentId, pos);
    }
    return pos;
  };

  const ensureRealized = (instrumentId: string, currency: string): MutableRealized => {
    let r = realized.get(instrumentId);
    if (!r) {
      r = { currency, realizedPnl: dec(0), dividends: dec(0), interest: dec(0), fees: dec(0) };
      realized.set(instrumentId, r);
    }
    return r;
  };

  const ordered = sortTransactions(
    options.asOf ? transactions.filter((t) => t.timestamp <= options.asOf!) : transactions,
  );

  for (const tx of ordered) {
    const currency = tx.currency;
    const pos = ensurePosition(tx.instrumentId, currency);
    const quantity = dec(tx.quantity);
    const price = dec(tx.price);
    const fee = dec(tx.fee ?? 0);
    const gross = quantity.times(price);

    switch (tx.type) {
      case "BUY": {
        pos.quantity = pos.quantity.plus(quantity);
        pos.costBasis = pos.costBasis.plus(gross).plus(fee);
        if (!pos.firstAcquiredAt) pos.firstAcquiredAt = tx.timestamp;
        break;
      }
      case "SELL": {
        const avgCost = pos.quantity.isZero() ? dec(0) : pos.costBasis.div(pos.quantity);
        const sellQty = quantity.greaterThan(pos.quantity) ? pos.quantity : quantity;
        if (quantity.greaterThan(pos.quantity)) {
          warnings.push(
            `SELL of ${quantity.toString()} exceeds held ${pos.quantity.toString()} for instrument ${tx.instrumentId} at ${tx.timestamp.toISOString()}`,
          );
        }
        const removedCost = avgCost.times(sellQty);
        const r = ensureRealized(tx.instrumentId, currency);
        r.realizedPnl = r.realizedPnl.plus(gross.minus(removedCost)).minus(fee);
        r.fees = r.fees.plus(fee);
        pos.costBasis = pos.costBasis.minus(removedCost);
        pos.quantity = pos.quantity.minus(sellQty);
        if (pos.quantity.lessThanOrEqualTo(0)) {
          pos.quantity = dec(0);
          pos.costBasis = dec(0);
        }
        break;
      }
      case "DEPOSIT":
      case "TRANSFER_IN": {
        pos.quantity = pos.quantity.plus(quantity);
        pos.costBasis = pos.costBasis.plus(gross).plus(fee);
        if (!pos.firstAcquiredAt) pos.firstAcquiredAt = tx.timestamp;
        break;
      }
      case "WITHDRAWAL":
      case "TRANSFER_OUT": {
        const avgCost = pos.quantity.isZero() ? dec(0) : pos.costBasis.div(pos.quantity);
        const outQty = quantity.greaterThan(pos.quantity) ? pos.quantity : quantity;
        pos.costBasis = pos.costBasis.minus(avgCost.times(outQty));
        pos.quantity = pos.quantity.minus(outQty);
        if (pos.quantity.lessThanOrEqualTo(0)) {
          pos.quantity = dec(0);
          pos.costBasis = dec(0);
        }
        break;
      }
      case "DIVIDEND": {
        // quantity = units held, price = dividend per unit (or quantity=1, price=amount).
        ensureRealized(tx.instrumentId, currency).dividends = ensureRealized(
          tx.instrumentId,
          currency,
        ).dividends.plus(gross);
        break;
      }
      case "INTEREST": {
        ensureRealized(tx.instrumentId, currency).interest = ensureRealized(
          tx.instrumentId,
          currency,
        ).interest.plus(gross);
        break;
      }
      case "FEE": {
        ensureRealized(tx.instrumentId, currency).fees = ensureRealized(
          tx.instrumentId,
          currency,
        ).fees.plus(fee.isZero() ? gross : fee);
        break;
      }
      case "SPLIT": {
        // quantity = split ratio (e.g. 2 for 2-for-1). Cost basis unchanged.
        const ratio = quantity;
        if (ratio.lessThanOrEqualTo(0)) {
          warnings.push(`SPLIT with non-positive ratio ignored for ${tx.instrumentId}`);
          break;
        }
        pos.quantity = pos.quantity.times(ratio);
        break;
      }
      case "ADJUSTMENT": {
        // quantity = absolute target quantity; price optionally re-bases cost.
        const target = quantity;
        if (price.greaterThan(0)) {
          pos.costBasis = target.times(price);
        } else if (!pos.quantity.isZero()) {
          const avgCost = pos.costBasis.div(pos.quantity);
          pos.costBasis = target.times(avgCost);
        }
        pos.quantity = target;
        if (pos.quantity.lessThanOrEqualTo(0)) {
          pos.quantity = dec(0);
          pos.costBasis = dec(0);
        }
        break;
      }
      default:
        break;
    }
  }

  const now = new Date();
  const positionList: Position[] = [];
  for (const [instrumentId, pos] of positions) {
    if (pos.quantity.isZero() && pos.costBasis.isZero()) continue;
    const averageCost = pos.quantity.isZero() ? dec(0) : pos.costBasis.div(pos.quantity);
    positionList.push({
      portfolioId,
      instrumentId,
      quantity: pos.quantity.toNumber(),
      averageCost: averageCost.toNumber(),
      costCurrency: pos.currency,
      costBasis: pos.costBasis.toNumber(),
      firstAcquiredAt: pos.firstAcquiredAt,
      updatedAt: now,
    });
  }

  const realizedList: RealizedPnl[] = [...realized.entries()].map(([instrumentId, r]) => ({
    instrumentId,
    currency: r.currency,
    realizedPnl: r.realizedPnl.toNumber(),
    dividends: r.dividends.toNumber(),
    interest: r.interest.toNumber(),
    fees: r.fees.toNumber(),
  }));

  return { positions: positionList, realized: realizedList, warnings };
}
