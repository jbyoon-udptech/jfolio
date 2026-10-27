import { isPositiveFinite } from "../domain/money";
import type { Repositories } from "../repositories/types";

/**
 * Latest positive direct rate for a currency pair at or before `asOf`.
 * Implementations may read the database or an in-memory range snapshot.
 */
export interface FxRateSource {
  rate(base: string, quote: string, asOf: Date): Promise<number | null>;
}

/** Database-backed source used by live / single-instant valuations. */
export class RepositoryFxRateSource implements FxRateSource {
  constructor(private readonly repos: Repositories) {}

  async rate(base: string, quote: string, asOf: Date): Promise<number | null> {
    const found = await this.repos.fxRates.getRate(base, quote, asOf);
    return found && isPositiveFinite(found.rate) ? found.rate : null;
  }
}

/**
 * FR-042: Resolve `from` -> `to` as of `asOf`, trying the direct pair, then the
 * inverse pair, then the stablecoin-via-USD bridge.
 *
 * Keeping the resolution rules here lets history prefetch reuse the exact same
 * semantics as a single-point valuation while answering from memory.
 */
export async function resolveFxRate(
  source: FxRateSource,
  from: string,
  to: string,
  asOf: Date,
  stablecoinPegs: ReadonlySet<string>,
): Promise<number | null> {
  if (from === to) return 1;
  const direct = await source.rate(from, to, asOf);
  if (direct !== null) return direct;
  const inverse = await source.rate(to, from, asOf);
  if (inverse !== null) return 1 / inverse;
  return resolveViaStablecoinPeg(source, from, to, asOf, stablecoinPegs);
}

/** Direct-or-inverse lookup against stored fiat rates. */
async function lookupFiat(
  source: FxRateSource,
  base: string,
  quote: string,
  asOf: Date,
): Promise<number | null> {
  const direct = await source.rate(base, quote, asOf);
  if (direct !== null) return direct;
  const inverse = await source.rate(quote, base, asOf);
  if (inverse !== null) return 1 / inverse;
  return null;
}

/**
 * Documented assumption: stablecoins (USDT, USDC, ...) are treated as pegged
 * 1:1 to USD because no fiat FX provider publishes them. This lets a
 * USDT-priced crypto asset be converted to the base currency through the
 * existing USD rate without inventing a synthetic price.
 */
async function resolveViaStablecoinPeg(
  source: FxRateSource,
  from: string,
  to: string,
  asOf: Date,
  pegs: ReadonlySet<string>,
): Promise<number | null> {
  const fromPegged = pegs.has(from);
  const toPegged = pegs.has(to);
  if (!fromPegged && !toPegged) return null;
  if (fromPegged && toPegged) return 1;
  if (fromPegged) {
    if (to === "USD") return 1;
    return lookupFiat(source, "USD", to, asOf);
  }
  // toPegged
  if (from === "USD") return 1;
  return lookupFiat(source, from, "USD", asOf);
}
