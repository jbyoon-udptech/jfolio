import { describe, expect, it } from "vitest";
import { groupHoldingsByCurrency } from "@/lib/holdings";

interface Row {
  id: string;
  currency: string;
}

describe("groupHoldingsByCurrency", () => {
  it("orders KRW, USD, USDT before other currencies and keeps row order", () => {
    const holdings: Row[] = [
      { id: "usdt", currency: "USDT" },
      { id: "usd-2", currency: "USD" },
      { id: "jpy", currency: "JPY" },
      { id: "krw", currency: "KRW" },
      { id: "usd-1", currency: "USD" },
    ];

    expect(
      groupHoldingsByCurrency(holdings).map((group) => [
        group.currency,
        group.items.map((item) => item.id),
      ]),
    ).toEqual([
      ["KRW", ["krw"]],
      ["USD", ["usd-2", "usd-1"]],
      ["USDT", ["usdt"]],
      ["JPY", ["jpy"]],
    ]);
  });

  it("returns no groups for an empty holdings list", () => {
    expect(groupHoldingsByCurrency([])).toEqual([]);
  });
});
