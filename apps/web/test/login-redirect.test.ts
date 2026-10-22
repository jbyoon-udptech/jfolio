import { describe, expect, it } from "vitest";
import { buildLoginUrl, resolvePublicOrigin } from "@/lib/login-redirect";

describe("login redirect origin", () => {
  const fallback = "https://localhost:3000";

  it("prefers the proxy forwarding headers over the internal origin", () => {
    expect(
      resolvePublicOrigin(
        "https",
        "jbnix.retailtrend.net",
        "127.0.0.1:3000",
        fallback,
      ),
    ).toBe("https://jbnix.retailtrend.net");
  });

  it("falls back to the Host header, then to the middleware origin", () => {
    expect(
      resolvePublicOrigin(null, null, "127.0.0.1:3000", fallback),
    ).toBe("https://127.0.0.1:3000");
    expect(resolvePublicOrigin(null, null, null, "http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
  });

  it("takes the first value of comma-separated forwarding headers", () => {
    expect(
      resolvePublicOrigin(
        "https, http",
        "jbnix.retailtrend.net, proxy.internal",
        null,
        fallback,
      ),
    ).toBe("https://jbnix.retailtrend.net");
  });
});

describe("login redirect location", () => {
  const origin = "https://jbnix.retailtrend.net";

  it("sends the dashboard to /login without a next parameter", () => {
    expect(buildLoginUrl(origin, "/")).toBe(`${origin}/login`);
  });

  it("preserves the requested path", () => {
    expect(buildLoginUrl(origin, "/portfolio")).toBe(
      `${origin}/login?next=%2Fportfolio`,
    );
  });

  it("preserves the query string", () => {
    expect(buildLoginUrl(origin, "/transactions", "?page=2&type=BUY")).toBe(
      `${origin}/login?next=%2Ftransactions%3Fpage%3D2%26type%3DBUY`,
    );
  });

  it("never leaks the internal bind address", () => {
    const location = buildLoginUrl(origin, "/assets/ins_1", "?tab=cash");
    expect(location.startsWith(`${origin}/login`)).toBe(true);
    expect(location).not.toContain("localhost");
  });
});
