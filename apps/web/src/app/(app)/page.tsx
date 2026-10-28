import Link from "next/link";
import { redirect } from "next/navigation";
import { ALL_PORTFOLIOS_ID } from "@jfolio/shared";
import { AllDashboardSections } from "@/components/AllDashboardSections";
import { AllocationList } from "@/components/AllocationList";
import { DashboardHoldingsTable } from "@/components/DashboardHoldingsTable";
import { LineChart } from "@/components/LineChart";
import { ApiErrorNotice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { PortfolioSelect } from "@/components/PortfolioSelect";
import { StatusBadge } from "@/components/StatusBadge";
import type { Option } from "@/components/TransactionForm";
import { api, safe } from "@/lib/api";
import {
  formatCurrency,
  formatDateTime,
  formatPercent,
  formatSignedCurrency,
} from "@/lib/format";
import { normalizePeriod, periodRange, PERIODS } from "@/lib/period";
import { resolvePortfolioSelection } from "@/lib/portfolio-selection";
import { readSelectedPortfolioCookie } from "@/lib/server-portfolio";

export const dynamic = "force-dynamic";

/** UI-001: the overall asset dashboard. */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; portfolioId?: string }>;
}) {
  const params = await searchParams;
  const period = normalizePeriod(params.period);
  const cookiePortfolioId = await readSelectedPortfolioCookie();
  const portfoliosResult = await safe(() => api.portfolios());
  const selection = resolvePortfolioSelection({
    searchValue: params.portfolioId,
    cookieValue: cookiePortfolioId,
    knownIds: portfoliosResult.data?.items.map((p) => p.portfolioId),
    allowAll: true,
  });

  // A hidden portfolio must not remain in view; fall back to the default one.
  if (selection.invalidExplicit) {
    redirect(params.period ? `/?period=${encodeURIComponent(params.period)}` : "/");
  }

  const dashboardResult = await safe(() =>
    api.dashboard({
      portfolioId: selection.isAll ? ALL_PORTFOLIOS_ID : selection.portfolioId,
    }),
  );
  if (!dashboardResult.data) {
    return <ApiErrorNotice error={dashboardResult.error} />;
  }
  const dashboard = dashboardResult.data;
  const currency = dashboard.baseCurrency;
  const portfolioSummaries = dashboard.portfolios ?? [];
  const range = periodRange(period);
  // Keep an actual selection (explicit URL or cookie) in period links. A page
  // that merely fell back to the API default should not turn that default into
  // an implicit saved selection.
  const portfolioQuery = selection.isAll
    ? `&portfolioId=${ALL_PORTFOLIOS_ID}`
    : selection.portfolioId
      ? `&portfolioId=${encodeURIComponent(selection.portfolioId)}`
      : "";
  const historyResult = await safe(() =>
    api.dashboardHistory({
      portfolioId: dashboard.portfolioId,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      interval: range.interval,
    }),
  );
  const points = historyResult.data?.items ?? [];
  const historySeries = historyResult.data?.series ?? [];

  const portfolioOptions: Option[] = (portfoliosResult.data?.items ?? []).map((p) => ({
    value: p.portfolioId,
    label: `${p.name} (${p.baseCurrency})`,
  }));

  return (
    <>
      <PageHeader
        selector={
          portfolioOptions.length > 0 ? (
            <PortfolioSelect
              portfolios={portfolioOptions}
              currentId={dashboard.portfolioId}
              extraQuery={params.period ? `period=${params.period}` : undefined}
              explicitPortfolioId={params.portfolioId}
              allOptionLabel="All"
              allOptionValue={ALL_PORTFOLIOS_ID}
            />
          ) : undefined
        }
        actions={<StatusBadge status={dashboard.dataStatus} />}
        title={selection.isAll ? "종합 대시보드" : "전체 자산 대시보드"}
        baseCurrency={currency}
        referenceTime={dashboard.asOf}
        subtitle={
          selection.isAll ? "종합 대시보드 · 모든 포트폴리오 통합" : undefined
        }
      />

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="metric-label">
            {selection.isAll ? "종합 평가금액" : "전체 자산 평가금액"}
          </div>
          <div className="metric-value">{formatCurrency(dashboard.totalAssetValue, currency)}</div>
          <div className={`metric-delta ${changeClass(dashboard.dailyChange)}`}>
            {formatSignedCurrency(dashboard.dailyChange, currency)}{" "}
            {dashboard.dailyChangeRate === null ? (
              <span className="muted">(전일 데이터 없음)</span>
            ) : (
              <span>({formatPercent(dashboard.dailyChangeRate)})</span>
            )}
          </div>
          {selection.isAll ? (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {portfolioSummaries.length}개 포트폴리오 합산
            </div>
          ) : null}
        </div>
        <div className="card">
          <div className="metric-label">총 매입 원가</div>
          <div className="metric-value small">
            {formatCurrency(dashboard.totalCostBasis, currency)}
          </div>
          <div className="metric-label" style={{ marginTop: 12 }}>
            미실현 손익
          </div>
          <div className={`metric-value small ${changeClass(dashboard.unrealizedPnL)}`}>
            {formatCurrency(dashboard.unrealizedPnL, currency)}{" "}
            <span style={{ fontSize: 13 }}>({formatPercent(dashboard.unrealizedReturn)})</span>
          </div>
        </div>
        <div className="card">
          <div className="metric-label">데이터 상태</div>
          <div style={{ margin: "6px 0 12px" }}>
            <StatusBadge status={dashboard.dataStatus} />
            {dashboard.unavailableCount > 0 ? (
              <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
                평가 불가 {dashboard.unavailableCount}건
              </span>
            ) : null}
          </div>
          <div className="metric-label">마지막 데이터 갱신</div>
          <div>{formatDateTime(dashboard.lastDataUpdatedAt)}</div>
        </div>
      </div>

      {selection.isAll ? (
        <AllDashboardSections
          summaries={portfolioSummaries}
          series={historySeries}
          currency={currency}
          period={period}
          portfolioQuery={portfolioQuery}
          interval={range.interval}
        />
      ) : (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="toolbar">
            <h2 style={{ margin: 0 }}>자산 평가금액 추이</h2>
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
          <LineChart points={points} currency={currency} interval={range.interval} />
          {points.some((p) => p.totalAssetValue === null) ? (
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              * 누락 구간은 보간하지 않고 선이 끊어져 표시됩니다.
            </div>
          ) : null}
        </div>
      )}

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h2>자산군별 비중</h2>
          <AllocationList slices={dashboard.allocationByAssetType} currency={currency} />
        </div>
        <div className="card">
          <h2>통화별 비중</h2>
          <AllocationList slices={dashboard.allocationByCurrency} currency={currency} />
        </div>
      </div>

      <div className="grid cols-2">
        <DashboardHoldingsTable
          holdings={dashboard.topHoldings}
          currency={currency}
        />

        <div className="card">
          <h2>최근 시그널</h2>
          {dashboard.recentSignals.length === 0 ? (
            <div className="empty">발생한 시그널이 없습니다.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>발생 시각</th>
                  <th>유형</th>
                  <th className="num">관측값</th>
                  <th className="num">변동률</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.recentSignals.map((signal) => (
                  <tr key={signal.eventId}>
                    <td className="muted">{formatDateTime(signal.triggeredAt)}</td>
                    <td>{signal.signalType}</td>
                    <td className="num">{signal.observedPrice}</td>
                    <td className={`num ${changeClass(signal.changeRate)}`}>
                      {formatPercent(signal.changeRate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <p className="muted" style={{ marginTop: 16, fontSize: 12 }}>
        포트폴리오{" "}
        {dashboard.portfolioId === ALL_PORTFOLIOS_ID ? "All" : dashboard.portfolioId} ·
        미실현 수익률 {formatPercent(dashboard.unrealizedReturn)}
      </p>
    </>
  );
}

function changeClass(value: number | null): string {
  if (value === null) return "";
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "";
}
