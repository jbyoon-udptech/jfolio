import { describe, expect, it } from "vitest";
import {
  buildPurchaseWithdrawal,
  buildSaleDeposit,
  findCashOptions,
  grossPurchaseCost,
  netSaleProceeds,
} from "@/lib/cash-settlement";

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

describe("grossPurchaseCost", () => {
  it("returns the gross cost when there is no fee", () => {
    expect(grossPurchaseCost(10, 100)).toBe(1000);
  });

  it("adds the buy fee, which is part of the cost basis", () => {
    expect(grossPurchaseCost(10, 100, 5)).toBe(1005);
  });

  it("rounds binary-float artefacts", () => {
    expect(grossPurchaseCost(0.1, 0.2)).toBe(0.02);
  });

  it("rejects non-finite or non-positive inputs", () => {
    expect(grossPurchaseCost(Number.NaN, 100)).toBe(0);
    expect(grossPurchaseCost(10, Number.POSITIVE_INFINITY)).toBe(0);
    expect(grossPurchaseCost(0, 100, 0)).toBe(0);
  });
});

describe("buildSaleDeposit", () => {
  it("builds a DEPOSIT priced at 1 for the net amount", () => {
    expect(
      buildSaleDeposit({
        portfolioId: "p1",
        cashInstrumentId: "usd-cash",
        amount: 995,
        timestamp: "2026-01-02T03:04:05.000Z",
        memo: "Apple 매도 대금",
      }),
    ).toEqual({
      portfolioId: "p1",
      instrumentId: "usd-cash",
      type: "DEPOSIT",
      timestamp: "2026-01-02T03:04:05.000Z",
      quantity: 995,
      price: 1,
      fee: 0,
      memo: "Apple 매도 대금",
    });
  });

  it("defaults the memo to null", () => {
    const deposit = buildSaleDeposit({
      portfolioId: "p1",
      cashInstrumentId: "usd-cash",
      amount: 100,
      timestamp: "2026-01-02T03:04:05.000Z",
    });
    expect(deposit.memo).toBeNull();
  });
});

describe("buildPurchaseWithdrawal", () => {
  it("builds a WITHDRAWAL priced at 1 for the gross cost", () => {
    expect(
      buildPurchaseWithdrawal({
        portfolioId: "p1",
        cashInstrumentId: "usd-cash",
        amount: 1005,
        timestamp: "2026-01-02T03:04:05.000Z",
        memo: "Apple 매수 대금",
      }),
    ).toEqual({
      portfolioId: "p1",
      instrumentId: "usd-cash",
      type: "WITHDRAWAL",
      timestamp: "2026-01-02T03:04:05.000Z",
      quantity: 1005,
      price: 1,
      fee: 0,
      memo: "Apple 매수 대금",
    });
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
