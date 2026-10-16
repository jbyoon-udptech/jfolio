import Decimal from "decimal.js";

// NFR-004: financial math must not rely on raw IEEE-754 float arithmetic.
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type Numeric = number | string | Decimal;

export function dec(value: Numeric): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

/** Multiply quantity by price using exact decimal arithmetic, return number. */
export function multiply(a: Numeric, b: Numeric): number {
  return dec(a).times(dec(b)).toNumber();
}

export function add(...values: Numeric[]): number {
  return values.reduce<Decimal>((acc, v) => acc.plus(dec(v)), new Decimal(0)).toNumber();
}

export function subtract(a: Numeric, b: Numeric): number {
  return dec(a).minus(dec(b)).toNumber();
}

export function divide(a: Numeric, b: Numeric): number | null {
  const divisor = dec(b);
  if (divisor.isZero()) return null;
  return dec(a).div(divisor).toNumber();
}

/** Round half-up to `digits` decimal places, returned as a number. */
export function round(a: Numeric, digits: number): number {
  return dec(a).toDecimalPlaces(digits, Decimal.ROUND_HALF_UP).toNumber();
}

/** True when `value` is a finite, strictly positive number. */
export function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** True when `value` is a finite number (may be zero or negative). */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
