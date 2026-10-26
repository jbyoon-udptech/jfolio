import Link from "next/link";
import { redirect } from "next/navigation";
import { AllocationList } from "@/components/AllocationList";
import { LineChart } from "@/components/LineChart";
import { ApiErrorNotice } from "@/components/Notice";
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

export const dynamic = "force-dynamic";

/** UI-001: the overall asset dashboard. */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; portfolioId?: string }>;
}) {
  const params = await searchParams;
  const period = normalizePeriod(params.period);
  const [dashboardResult, portfoliosResult] = await Promise.all([
    safe(() => api.dashboard({ portfolioId: params.portfolioId })),
    safe(() => api.portfolios()),
  ]);
  if (!dashboardResult.data) {
    return <ApiErrorNotice error={dashboardResult.error} />;
  }
  const dashboard = dashboardResult.data;
  const currency = dashboard.baseCurrency;

  // A hidden portfolio must not remain in view; fall back to the default one.
  if (
    params.portfolioId &&
    portfoliosResult.data &&
    !portfoliosResult.data.items.some((p) => p.portfolioId === params.portfolioId)
  ) {
    redirect(params.period ? `/?period=${encodeURIComponent(params.period)}` : "/");
  }

  const range = periodRange(period);
  const historyResult = await safe(() =>
    api.history(dashboard.portfolioId, {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      interval: range.interval,
    }),
  );
  const points = historyResult.data?.items ?? [];

  const portfolioOptions: Option[] = (portfoliosResult.data?.items ?? []).map((p) => ({
    value: p.portfolioId,
    label: `${p.name} (${p.baseCurrency})`,
  }));

  return (
    <>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 className="page-title">전체 자산 대시보드</h1>
          <p className="page-sub">
            기준 통화 {currency} · 기준 시각 {formatDateTime(dashboard.asOf)}
          </p>
        </div>
        <div className="toolbar" style={{ marginBottom: 0, gap: 12 }}>
          {portfolioOptions.length > 0 ? (
            <PortfolioSelect
              portfolios={portfolioOptions}
              currentId={dashboard.portfolioId}
              extraQuery={params.period ? `period=${params.period}` : undefined}
            />
          ) : null}
          <StatusBadge status={dashboard.dataStatus} />
        </div>
      </div>

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="metric-label">전체 자산 평가금액</div>
          <div className="metric-value">{formatCurrency(dashboard.totalAssetValue, currency)}</div>
          <div className={`metric-delta ${changeClass(dashboard.dailyChange)}`}>
            {formatSignedCurrency(dashboard.dailyChange, currency)}{" "}
            {dashboard.dailyChangeRate === null ? (
              <span className="muted">(전일 데이터 없음)</span>
            ) : (
              <span>({formatPercent(dashboard.dailyChangeRate)})</span>
            )}
          </div>
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

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="toolbar">
          <h2 style={{ margin: 0 }}>자산 평가금액 추이</h2>
          <div className="pill-row" style={{ marginLeft: "auto" }}>
            {PERIODS.map((option) => (
              <Link
                key={option}
                href={`/?period=${option}${params.portfolioId ? `&portfolioId=${params.portfolioId}` : ""}`}
                className={`pill ${option === period ? "active" : ""}`}
              >
                {option}
              </Link>
            ))}
          </div>
        </div>
        <LineChart points={points} currency={currency} />
        {points.some((p) => p.totalAssetValue === null) ? (
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            * 누락 구간은 보간하지 않고 선이 끊어져 표시됩니다.
          </div>
        ) : null}
      </div>

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
        <div className="card">
          <h2>주요 보유 종목</h2>
          {dashboard.topHoldings.length === 0 ? (
            <div className="empty">보유 종목이 없습니다.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>종목</th>
                  <th className="num">평가금액</th>
                  <th className="num">수익률</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.topHoldings.map((holding) => (
                  <tr key={holding.instrumentId}>
                    <td>
                      <Link href={`/assets/${holding.instrumentId}`}>{holding.name}</Link>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {holding.symbol}
                      </div>
                    </td>
                    <td className="num">
                      {holding.marketValueBase === null
                        ? "평가 불가"
                        : formatCurrency(holding.marketValueBase, currency)}
                    </td>
                    <td className={`num ${changeClass(holding.unrealizedPnL)}`}>
                      {formatPercent(holding.unrealizedReturn)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

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
        포트폴리오 {dashboard.portfolioId} · 미실현 수익률{" "}
        {formatPercent(dashboard.unrealizedReturn)}
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
