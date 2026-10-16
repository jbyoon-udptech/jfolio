/**
 * Yahoo Finance ticker resolution.
 *
 * Yahoo does not accept the bare local code for many non-US listings: Korean
 * equities must be requested as `005930.KS` (KOSPI) or `091990.KQ` (KOSDAQ).
 * The instrument master stores the neutral local code, so the Yahoo provider
 * derives the exchange suffix from `Instrument.market` here instead of forcing
 * every user to know Yahoo's convention (FR-011: provider-specific symbols stay
 * inside the provider boundary).
 *
 * Korean boards are special-cased: a KRX listing is either KOSPI or KOSDAQ and
 * the market alone cannot tell them apart, so both suffixes are offered as
 * candidates and the provider tries them in order.
 */
const KOREAN_BOARD_SUFFIXES: Record<string, string[]> = {
  KRX: [".KS", ".KQ"],
  KOSPI: [".KS"],
  KOSDAQ: [".KQ"],
};

/** Korean tickers are 6-digit numeric codes (e.g. "005930", "000660"). */
const KOREAN_CODE = /^\d{6}$/;

/**
 * Ordered list of Yahoo tickers to try for an instrument, most likely first.
 *
 * - An explicit exchange suffix already present in the symbol always wins, so a
 *   caller can override the mapping (e.g. a Korean company's US listing).
 * - A Korean market with a 6-digit code gets the board suffix appended; `KRX`
 *   yields both boards so KOSDAQ codes resolve without the user picking a board.
 * - Any other symbol is returned unchanged.
 */
export function yahooSymbolCandidates(rawSymbol: string, market: string): string[] {
  const symbol = rawSymbol.trim();
  if (!symbol) return [];
  // Respect an explicit suffix such as "005930.KS" or "7203.T".
  if (symbol.includes(".")) return [symbol];

  const suffixes = KOREAN_BOARD_SUFFIXES[market.trim().toUpperCase()];
  if (!suffixes || !KOREAN_CODE.test(symbol)) return [symbol];

  return suffixes.map((suffix) => `${symbol}${suffix}`);
}
