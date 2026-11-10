import { describe, expect, it } from "vitest";
import { findCashOptions, netSaleProceeds } from "@/lib/cash-settlement";

const OPTIONS = [
  { value: "usd-cash", label: "USD 현금", currency: "USD", assetType: "CASH" },
  { value: "krw-cash", label: "KRW 현금", currency: "KRW", assetType: "CASH" },
  { value: "aapl", label: "Apple", currency: "USD", assetType: "STOCK" },
];

describe("netSaleProceeds", () => {
  it("returns the gross proceeds when there is no fee", () => {
    expect(netSaleProceeds(10, 100)).toBe(1000);
  });

  it("deducts the sale fee", () => {
    expect(netSaleProceeds(10, 100, 5)).toBe(995);
  });

  it("rounds binary-float artefacts", () => {
    expect(netSaleProceeds(0.1, 0.2)).toBe(0.02);
  });

  it("rejects non-finite inputs", () => {
    expect(netSaleProceeds(Number.NaN, 100)).toBe(0);
    expect(netSaleProceeds(10, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("returns 0 when the fee consumes the proceeds", () => {
    expect(netSaleProceeds(1, 10, 10)).toBe(0);
    expect(netSaleProceeds(1, 10, 20)).toBe(0);
  });
});

describe("findCashOptions", () => {
  it("keeps only CASH assets in the requested currency", () => {
    expect(findCashOptions(OPTIONS, "USD").map((option) => option.value)).toEqual([
      "usd-cash",
    ]);
  });

  it("matches the currency case-insensitively", () => {
    expect(findCashOptions(OPTIONS, " usd ").map((option) => option.value)).toEqual([
      "usd-cash",
    ]);
  });

  it("returns an empty list for a missing or unknown currency", () => {
    expect(findCashOptions(OPTIONS, "")).toEqual([]);
    expect(findCashOptions(OPTIONS, "JPY")).toEqual([]);
  });
});
