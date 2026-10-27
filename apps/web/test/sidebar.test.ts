import { describe, expect, it } from "vitest";
import { SIDEBAR_COOKIE, parseSidebarState } from "@/lib/sidebar";

describe("sidebar cookie state", () => {
  it("uses a stable cookie name", () => {
    expect(SIDEBAR_COOKIE).toBe("jfolio_sidebar");
  });

  it("recognizes the collapsed value", () => {
    expect(parseSidebarState("collapsed")).toBe("collapsed");
  });

  it("defaults missing and unknown values to collapsed", () => {
    expect(parseSidebarState(undefined)).toBe("collapsed");
    expect(parseSidebarState("")).toBe("collapsed");
    expect(parseSidebarState("anything-else")).toBe("collapsed");
  });

  it("recognizes the expanded value", () => {
    expect(parseSidebarState("expanded")).toBe("expanded");
  });
});
