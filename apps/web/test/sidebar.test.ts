import { describe, expect, it } from "vitest";
import { SIDEBAR_COOKIE, parseSidebarState } from "@/lib/sidebar";

describe("sidebar cookie state", () => {
  it("uses a stable cookie name", () => {
    expect(SIDEBAR_COOKIE).toBe("jfolio_sidebar");
  });

  it("recognizes the collapsed value", () => {
    expect(parseSidebarState("collapsed")).toBe("collapsed");
  });

  it("treats expanded, missing and unknown values as expanded", () => {
    expect(parseSidebarState("expanded")).toBe("expanded");
    expect(parseSidebarState(undefined)).toBe("expanded");
    expect(parseSidebarState("")).toBe("expanded");
    expect(parseSidebarState("anything-else")).toBe("expanded");
  });
});
