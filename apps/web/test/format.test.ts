import { describe, expect, it } from "vitest";
import {
  EMPTY,
  UNAVAILABLE,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatPrice,
  formatQuantity,
  formatSignedCurrency,
  formatWeight,
  toLocalDateTimeInput,
} from "@/lib/format";
import { normalizePeriod, periodRange } from "@/lib/period";

/**
 * UI-006: missing data must render as an explicit placeholder, never as 0.
 * These tests lock that contract down.
 */
describe("UI-006 formatting", () => {
  it("renders unavailable placeholders instead of zero for currency", () => {
    expect(formatCurrency(null, "KRW")).toBe(UNAVAILABLE);
    expect(formatCurrency(undefined, "USD")).toBe(UNAVAILABLE);
    expect(formatCurrency(Number.NaN, "USD")).toBe(UNAVAILABLE);
    expect(formatCurrency(Number.POSITIVE_INFINITY, "USD")).toBe(UNAVAILABLE);
  });

  it("renders a genuine zero differently from missing data", () => {
    const zero = formatCurrency(0, "USD");
    expect(zero).not.toBe(UNAVAILABLE);
    expect(zero).toContain("0");
  });

  it("falls back to a plain code string for non-ISO currencies", () => {
    const value = formatCurrency(1234.5, "USDT");
    expect(value).toContain("USDT");
    expect(value).not.toBe(UNAVAILABLE);
  });

  it("signs currency amounts explicitly", () => {
    expect(formatSignedCurrency(2500, "KRW").startsWith("+")).toBe(true);
    expect(formatSignedCurrency(-2500, "KRW").startsWith("-")).toBe(true);
    expect(formatSignedCurrency(null, "KRW")).toBe(UNAVAILABLE);
  });

  it("formats percent values and keeps a null distinct", () => {
    expect(formatPercent(25)).toBe("+25.00%");
    expect(formatPercent(-5)).toBe("-5.00%");
    expect(formatPercent(0)).toBe("0.00%");
    expect(formatPercent(null)).toBe(EMPTY);
  });

  it("formats weights as percentage points", () => {
    expect(formatWeight(0.72)).toBe("0.72%");
    expect(formatWeight(null)).toBe(EMPTY);
  });

  it("handles prices, quantities and plain numbers", () => {
    expect(formatPrice(null, "USD")).toBe(EMPTY);
    expect(formatNumber(null)).toBe(EMPTY);
    expect(formatQuantity(null)).toBe(EMPTY);
    // 8 fractional digits maximum for crypto-sized quantities.
    expect(formatQuantity(1.123456789)).toBe("1.12345679");
  });

  it("formats date-times in the configured time zone (Asia/Seoul)", () => {
    expect(formatDateTime("2026-10-16T12:00:00.000Z")).toBe("2026-10-16 21:00:00");
    expect(
      formatDateTime("2026-10-16T12:00:00.000Z", { seconds: false }),
    ).toBe("2026-10-16 21:00");
    expect(formatDate("2026-10-16T12:00:00.000Z")).toBe("2026-10-16");
    expect(formatDateTime(null)).toBe(EMPTY);
    expect(formatDateTime("not-a-date")).toBe(EMPTY);
  });

  it("round-trips an instant through a datetime-local value", () => {
    const iso = "2026-10-16T12:00:00.000Z";
    const local = toLocalDateTimeInput(iso);
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    // Interpreting the value as local time restores the original instant.
    expect(new Date(local).getTime()).toBe(new Date(iso).getTime());
    expect(toLocalDateTimeInput("not-a-date")).toBe("");
  });
});

describe("period helpers (UI-001)", () => {
  it("normalises unknown periods to the default", () => {
    expect(normalizePeriod("1Y")).toBe("1Y");
    expect(normalizePeriod("bogus")).toBe("1M");
    expect(normalizePeriod(undefined)).toBe("1M");
  });

  it("maps 1D to an hourly window and longer periods to daily", () => {
    const now = new Date("2026-10-16T12:00:00.000Z");
    const intraday = periodRange("1D", now);
    expect(intraday.interval).toBe("hourly");
    expect(intraday.from.toISOString()).toBe("2026-10-15T12:00:00.000Z");

    const monthly = periodRange("1M", now);
    expect(monthly.interval).toBe("daily");
    expect(monthly.to.getTime()).toBe(now.getTime());
  });
});
