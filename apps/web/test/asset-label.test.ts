import { describe, expect, it } from "vitest";
import { splitAssetLabel } from "@/lib/asset-label";

describe("asset label splitting", () => {
  it("keeps short names intact", () => {
    expect(splitAssetLabel("삼성전자")).toEqual({
      head: "삼성전자",
      tail: "",
      separator: false,
      truncated: false,
    });
    expect(splitAssetLabel("BTC")).toEqual({
      head: "BTC",
      tail: "",
      separator: false,
      truncated: false,
    });
    expect(splitAssetLabel("  SK하이닉스  ")).toEqual({
      head: "SK하이닉스",
      tail: "",
      separator: false,
      truncated: false,
    });
    expect(splitAssetLabel("")).toEqual({
      head: "",
      tail: "",
      separator: false,
      truncated: false,
    });
  });

  it("keeps the distinguishing tail of long ETF names", () => {
    expect(splitAssetLabel("KODEX 미국S&P500TR")).toEqual({
      head: "KODEX 미국",
      tail: "S&P500TR",
      separator: false,
      truncated: true,
    });
    expect(splitAssetLabel("TIGER 미국S&P500커버드콜액티브(H)")).toEqual({
      head: "TIGER 미국S&P500커버드콜",
      tail: "액티브(H)",
      separator: false,
      truncated: true,
    });
  });

  it("keeps a long strategy suffix such as 레버리지", () => {
    expect(splitAssetLabel("ABCD 레버리지")).toEqual({
      head: "ABCD",
      tail: "레버리지",
      separator: true,
      truncated: true,
    });
  });

  it("snaps the tail to a word boundary when it fits", () => {
    expect(splitAssetLabel("SPDR S&P 500 ETF Trust")).toEqual({
      head: "SPDR S&P 500",
      tail: "ETF Trust",
      separator: true,
      truncated: true,
    });
    expect(splitAssetLabel("TIGER 미국S&P500 커버드콜(H)")).toEqual({
      head: "TIGER 미국S&P500",
      tail: "커버드콜(H)",
      separator: true,
      truncated: true,
    });
  });

  it("only removes characters from the head, never from the tail", () => {
    const name = "TIGER 미국S&P500커버드콜액티브(H)";
    const parts = splitAssetLabel(name);
    expect(parts.head.length).toBeGreaterThan(0);
    expect(name.startsWith(parts.head)).toBe(true);
    expect(name.endsWith(parts.tail)).toBe(true);
  });
});
