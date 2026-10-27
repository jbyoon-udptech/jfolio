import Link from "next/link";
import { PortfolioTrendChart } from "@/components/PortfolioTrendChart";
import { PortfolioValuationTable } from "@/components/PortfolioValuationTable";
import { toPortfolioTrendSeries } from "@/lib/dashboard";
import { PERIODS, type Period } from "@/lib/period";
import type { PortfolioDashboardSummary, PortfolioHistorySeries } from "@/lib/types";

/**
 * UI-001: the extra sections shown when the page-level selector is `All`.
 * Every amount is already converted to the aggregate dashboard's base currency
 * by the API, so the table and chart share one axis.
 */
export function AllDashboardSections({
  summaries,
  series,
  currency,
  period,
  portfolioQuery,
  interval,
}: {
  summaries: PortfolioDashboardSummary[];
  series: PortfolioHistorySeries[];
  currency: string;
  period: Period;
  portfolioQuery: string;
  interval: "hourly" | "daily";
}) {
  const trendSeries = toPortfolioTrendSeries(series);
  const hasGap = trendSeries.some((item) =>
    item.points.some((point) => point.totalAssetValue === null),
  );

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="toolbar">
          <h2 style={{ margin: 0 }}>포트폴리오별 평가금액</h2>
          <span className="muted" style={{ marginLeft: "auto", fontSize: 12 }}>
            기준 통화 {currency}
          </span>
        </div>
        <PortfolioValuationTable summaries={summaries} currency={currency} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="toolbar">
          <h2 style={{ margin: 0 }}>포트폴리오별 평가금액 추이</h2>
          <div className="pill-row" style={{ marginLeft: "auto" }}>
            {PERIODS.map((option) => (
              <Link
                key={option}
                href={`/?period=${option}${portfolioQuery}`}
                className={`pill ${option === period ? "active" : ""}`}
              >
                {option}
              </Link>
            ))}
          </div>
        </div>
        <PortfolioTrendChart
          series={trendSeries}
          currency={currency}
          interval={interval}
        />
        {hasGap ? (
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            * 누락 구간은 보간하지 않고 선이 끊어져 표시됩니다.
          </div>
        ) : null}
      </div>
    </>
  );
}
