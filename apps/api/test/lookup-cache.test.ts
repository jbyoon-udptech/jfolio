import { describe, expect, it } from "vitest";
import { LookupCache } from "../src/services/lookup-cache";

describe("LookupCache", () => {
  it("shares one loader across concurrent lookups of the same key", async () => {
    const cache = new LookupCache();
    let calls = 0;
    const load = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return 42;
    };

    const [a, b, c] = await Promise.all([
      cache.get("key", load),
      cache.get("key", load),
      cache.get("key", load),
    ]);

    expect([a, b, c]).toEqual([42, 42, 42]);
    expect(calls).toBe(1);
  });

  it("caches a resolved lookup for later callers", async () => {
    const cache = new LookupCache();
    let calls = 0;
    const load = async () => {
      calls += 1;
      return "value";
    };

    expect(await cache.get("key", load)).toBe("value");
    expect(await cache.get("key", load)).toBe("value");
    expect(calls).toBe(1);
  });

  it("evicts a rejected lookup so the next caller retries", async () => {
    const cache = new LookupCache();
    let calls = 0;
    const failing = async () => {
      calls += 1;
      throw new Error("boom");
    };

    await expect(cache.get("key", failing)).rejects.toThrow("boom");
    await expect(
      cache.get("key", async () => {
        calls += 1;
        return 7;
      }),
    ).resolves.toBe(7);
    expect(calls).toBe(2);
  });

  it("returns a seeded value without invoking the loader", async () => {
    const cache = new LookupCache();
    cache.seed("seeded", "value");
    let calls = 0;

    const result = await cache.get("seeded", async () => {
      calls += 1;
      return "other";
    });

    expect(result).toBe("value");
    expect(calls).toBe(0);
  });
});
