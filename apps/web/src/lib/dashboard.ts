import type { HistoryPoint, PortfolioHistorySeries } from "@/lib/types";

/** A chart-ready series; keeps the API payload out of the chart component. */
export interface PortfolioTrendSeries {
  id: string;
  label: string;
  points: HistoryPoint[];
  /** Highlighted aggregate line shown in the `All` dashboard chart. */
  total?: boolean;
}

/** Label for the aggregate line appended to the `All` trend chart. */
export const TOTAL_TREND_SERIES_LABEL = "전체 합계";

const TOTAL_TREND_SERIES_ID = "__total__";

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

/**
 * Append the API's aggregate history (`items`) as the highlighted total line.
 * The total is appended last so the per-portfolio color indexes stay stable and
 * the individual series are annotated exactly as before.
 */
export function withTotalTrendSeries(
  series: readonly PortfolioHistorySeries[] | undefined,
  totalPoints: readonly HistoryPoint[] | undefined,
): PortfolioTrendSeries[] {
  const mapped = toPortfolioTrendSeries(series);
  if (!totalPoints || totalPoints.length === 0) return mapped;
  return [
    ...mapped,
    {
      id: TOTAL_TREND_SERIES_ID,
      label: TOTAL_TREND_SERIES_LABEL,
      points: [...totalPoints],
      total: true,
    },
  ];
}
