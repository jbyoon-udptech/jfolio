/**
 * Request-scoped memoisation for repeated read lookups.
 *
 * History series ask the same questions over and over (the ledger, instrument
 * metadata, the same FX pair at the same instant). The cache stores the pending
 * promise, so concurrent callers share a single database round trip instead of
 * issuing one query each. Failed lookups are evicted so a single error does not
 * poison the rest of the request.
 *
 * This cache is intentionally scoped to one HTTP request / service call: market
 * data changes continuously, so it must never outlive the operation that built
 * it.
 */
export class LookupCache {
  private readonly entries = new Map<string, Promise<unknown>>();

  get<T>(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key) as Promise<T> | undefined;
    if (cached) return cached;

    const pending = load();
    this.entries.set(key, pending);
    void pending.catch(() => {
      if (this.entries.get(key) === pending) this.entries.delete(key);
    });
    return pending;
  }

  /**
   * Pre-populate a key with an already-resolved value. Used after a bulk range
   * prefetch so per-point valuation can stay in memory.
   */
  seed<T>(key: string, value: T): void {
    this.entries.set(key, Promise.resolve(value));
  }
}
