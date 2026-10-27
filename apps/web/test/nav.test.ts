import { describe, expect, it } from "vitest";
import { NAV_LINKS, findNavLink, isNavActive } from "@/lib/nav";

describe("sidebar nav active route", () => {
  it("marks the dashboard active only on the root path", () => {
    expect(isNavActive("/", "/")).toBe(true);
    expect(isNavActive("/", "/portfolio")).toBe(false);
  });

  it("keeps a section active for its detail routes", () => {
    expect(isNavActive("/assets", "/assets")).toBe(true);
    expect(isNavActive("/assets", "/assets/ins_123")).toBe(true);
    expect(isNavActive("/assets", "/assetsx")).toBe(false);
  });

  it("does not treat /portfolios as /portfolio", () => {
    expect(isNavActive("/portfolio", "/portfolios")).toBe(false);
    expect(isNavActive("/portfolios", "/portfolios")).toBe(true);
  });
});

describe("page header nav label", () => {
  it("finds the nav link for a page, including detail routes", () => {
    expect(findNavLink("/transactions")?.label).toBe("거래 내역");
    expect(findNavLink("/assets/ins_123")?.label).toBe("자산 목록");
    expect(findNavLink("/unknown")).toBeUndefined();
  });
});

describe("sidebar nav model", () => {
  it("has unique hrefs and a label/icon for every link", () => {
    const hrefs = NAV_LINKS.map((link) => link.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const link of NAV_LINKS) {
      expect(link.label.length).toBeGreaterThan(0);
      expect(link.icon.length).toBeGreaterThan(0);
    }
  });

  it("keeps the existing destinations", () => {
    expect(NAV_LINKS.map((link) => link.href)).toEqual([
      "/",
      "/portfolio",
      "/history",
      "/transactions",
      "/assets",
      "/portfolios",
      "/signals",
      "/market-data",
    ]);
  });
});
