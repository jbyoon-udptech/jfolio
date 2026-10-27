import type { HistoryPoint, PortfolioHistorySeries } from "@/lib/types";

/** A chart-ready series; keeps the API payload out of the chart component. */
export interface PortfolioTrendSeries {
  id: string;
  label: string;
  points: HistoryPoint[];
}

/** Map the aggregate dashboard history's per-portfolio series for the chart. */
export function toPortfolioTrendSeries(
  series: readonly PortfolioHistorySeries[] | undefined,
): PortfolioTrendSeries[] {
  return (series ?? []).map((item) => ({
    id: item.portfolioId,
    label: item.name,
    points: item.items,
  }));
}
