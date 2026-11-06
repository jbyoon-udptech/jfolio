import { floorToInterval } from "./intervals";
import { divide, multiply, round, subtract } from "./money";

export interface DatedPrice {
  timestamp: Date;
  price: number;
}

export interface DailyPricePoint {
  asOf: Date;
  price: number | null;
  change: number | null;
  changeRate: number | null;
}

export interface DatedTotal {
  timestamp: Date;
  totalAssetValue: number | null;
}

export interface DailyTotalPoint {
  totalAssetValue: number | null;
  changeRate: number | null;
}

/**
 * Collapse stored quotes to one close per UTC day. A late-arriving quote for a
 * day must not regress a newer observation, so the newest timestamp wins.
 */
export function collectDailyCloses(quotes: readonly DatedPrice[]): Map<number, number> {
  const latest = new Map<number, { timestamp: number; price: number }>();
  for (const quote of quotes) {
    const day = floorToInterval(quote.timestamp, "1d").getTime();
    const existing = latest.get(day);
    if (!existing || quote.timestamp.getTime() >= existing.timestamp) {
      latest.set(day, { timestamp: quote.timestamp.getTime(), price: quote.price });
    }
  }
  return new Map([...latest].map(([day, entry]) => [day, entry.price]));
}

/**
 * Build one point per requested day. Days without a close keep `price: null`;
 * a close whose previous available close is unknown keeps `change: null`.
 * The previous close is the last stored day before it, not necessarily the
 * previous calendar day (weekends and holidays are naturally skipped).
 */
export function buildDailyPricePoints(
  closes: ReadonlyMap<number, number>,
  dates: readonly Date[],
): DailyPricePoint[] {
  const sortedDays = [...closes.keys()].sort((a, b) => a - b);
  const previousClose = new Map<number, number | null>();
  let previous: number | null = null;
  for (const day of sortedDays) {
    previousClose.set(day, previous);
    previous = closes.get(day) ?? null;
  }

  return dates.map((date) => {
    const day = floorToInterval(date, "1d").getTime();
    const price = closes.get(day) ?? null;
    const previousPrice = previousClose.get(day) ?? null;
    if (price === null || previousPrice === null || previousPrice <= 0) {
      return { asOf: new Date(day), price, change: null, changeRate: null };
    }
    const change = subtract(price, previousPrice);
    const ratio = divide(change, previousPrice);
    return {
      asOf: new Date(day),
      price,
      change,
      changeRate: ratio === null ? null : round(multiply(ratio, 100), 4),
    };
  });
}

/**
 * Align daily portfolio totals with the table's quote days and compute the
 * change rate against the previous available total. A missing or non-positive
 * baseline yields `changeRate: null` instead of a fabricated zero.
 */
export function buildDailyTotalPoints(
  totals: readonly DatedTotal[],
  dates: readonly Date[],
): DailyTotalPoint[] {
  const byDay = new Map<number, { timestamp: number; value: number | null }>();
  for (const total of totals) {
    const day = floorToInterval(total.timestamp, "1d").getTime();
    const existing = byDay.get(day);
    if (!existing || total.timestamp.getTime() >= existing.timestamp) {
      byDay.set(day, {
        timestamp: total.timestamp.getTime(),
        value: total.totalAssetValue,
      });
    }
  }

  const sortedDays = [...byDay.keys()].sort((a, b) => a - b);
  const previousTotal = new Map<number, number | null>();
  let previous: number | null = null;
  for (const day of sortedDays) {
    previousTotal.set(day, previous);
    const value = byDay.get(day)?.value ?? null;
    if (value !== null) previous = value;
  }

  return dates.map((date) => {
    const day = floorToInterval(date, "1d").getTime();
    const value = byDay.get(day)?.value ?? null;
    const previousValue = previousTotal.get(day) ?? null;
    if (value === null || previousValue === null || previousValue <= 0) {
      return { totalAssetValue: value, changeRate: null };
    }
    const ratio = divide(subtract(value, previousValue), previousValue);
    return {
      totalAssetValue: value,
      changeRate: ratio === null ? null : round(multiply(ratio, 100), 4),
    };
  });
}
