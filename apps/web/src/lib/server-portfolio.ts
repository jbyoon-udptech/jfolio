import { cookies } from "next/headers";
import { PORTFOLIO_COOKIE, parsePortfolioId } from "./portfolio-selection";

/** Read the persisted portfolio selection on the server. */
export async function readSelectedPortfolioCookie(): Promise<string | undefined> {
  return parsePortfolioId((await cookies()).get(PORTFOLIO_COOKIE)?.value);
}
