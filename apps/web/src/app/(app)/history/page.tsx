import { LineChart } from "@/components/LineChart";
import { ApiErrorNotice } from "@/components/Notice";
import { StatusBadge } from "@/components/StatusBadge";
import { api, safe } from "@/lib/api";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPercent,
  formatPrice,
  formatQuantity,
} from "@/lib/format";
import type { Valuation } from "@/lib/types";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const CURRENCIES = ["KRW", "USD", "JPY", "EUR"];

function startOfDayIso(date: string): string {
  return new Date(`${date}T00:00:00+09:00`).toISOString();
}
function endOfDayIso(date: string): string {
  return new Date(`${date}T23:59:59+09:00`).toISOString();
}

/** UI-004: historical performance with explicit gaps for missing data. */
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    interval?: string;
    baseCurrency?: string;
    asOf?: string;
    portfolioId?: string;
  }>;
}) {
  const params = await searchParams;
  const today = new Date();
  const toDate = params.to ?? today.toISOString().slice(0, 10);
  const fromDate =
    params.from ?? new Date(today.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const interval = params.interval === "hourly" ? "hourly" : "daily";
  const baseCurrency = params.baseCurrency ?? "KRW";
  const asOfDate = params.asOf ?? toDate;

  // Hidden portfolios are not selectable; drop the stale ID and use the default.
  if (params.portfolioId) {
    const portfoliosResult = await safe(() => api.portfolios());
    if (
      portfoliosResult.data &&
      !portfoliosResult.data.items.some((p) => p.portfolioId === params.portfolioId)
    ) {
      const next = new URLSearchParams();
      for (const key of ["from", "to", "interval", "baseCurrency", "asOf"] as const) {
        const value = params[key];
        if (value) next.set(key, value);
      }
      const qs = next.toString();
      redirect(qs ? `/history?${qs}` : "/history");
    }
  }

  const dashboardResult = await safe(() =>
    api.dashboard({ portfolioId: params.portfolioId, baseCurrency }),
  );
  if (!dashboardResult.data) {
    return <ApiErrorNotice error={dashboardResult.error} />;
  }
  const portfolioId = dashboardResult.data.portfolioId;

  const [historyResult, startResult, endResult, asOfResult] = await Promise.all([
    safe(() =>
      api.history(portfolioId, {
        from: startOfDayIso(fromDate),
        to: endOfDayIso(toDate),
        interval,
      }),
    ),
    safe(() =>
      api.valuation(portfolioId, { asOf: startOfDayIso(fromDate), baseCurrency }),
    ),
    safe(() => api.valuation(portfolioId, { asOf: endOfDayIso(toDate), baseCurrency })),
    safe(() => api.valuation(portfolioId, { asOf: endOfDayIso(asOfDate), baseCurrency })),
  ]);

  if (!historyResult.data) {
    return <ApiErrorNotice error={historyResult.error} />;
  }
  const points = historyResult.data.items;
  const start = startResult.data;
  const end = endResult.data;
  const asOf = asOfResult.data;

  return (
    <>
      <h1 className="page-title">과거 자산 현황</h1>
      <p className="page-sub">
        기간과 기준 통화를 선택해 일별/시간별 평가금액 추이와 특정 시점의 보유 현황을 확인합니다.
      </p>

      <form className="card" method="get" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <label>
            시작일
            <input type="date" name="from" defaultValue={fromDate} />
          </label>
          <label>
            종료일
            <input type="date" name="to" defaultValue={toDate} />
          </label>
          <label>
            기준 통화
            <select name="baseCurrency" defaultValue={baseCurrency}>
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
          <label>
            간격
            <select name="interval" defaultValue={interval}>
              <option value="daily">일별</option>
              <option value="hourly">시간별</option>
            </select>
          </label>
          <label>
            조회 기준일
            <input type="date" name="asOf" defaultValue={asOfDate} />
          </label>
          <button type="submit" className="primary">
            조회
          </button>
        </div>
      </form>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="toolbar">
          <h2 style={{ margin: 0 }}>평가금액 추이 ({interval === "hourly" ? "시간별" : "일별"})</h2>
        </div>
        <LineChart points={points} currency={baseCurrency} interval={interval} />
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          누락 구간은 보간하지 않고 선이 끊어져 표시됩니다.
        </div>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h2>기간 시작 / 종료 비교</h2>
          <table>
            <thead>
              <tr>
                <th>구분</th>
                <th>시각</th>
                <th className="num">평가금액</th>
                <th className="num">미실현 손익</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>시작</td>
                <td className="muted">{formatDate(start?.asOf)}</td>
                <td className="num">{formatCurrency(start?.totalAssetValue ?? null, baseCurrency)}</td>
                <td className="num">{formatCurrency(start?.unrealizedPnL ?? null, baseCurrency)}</td>
              </tr>
              <tr>
                <td>종료</td>
                <td className="muted">{formatDate(end?.asOf)}</td>
                <td className="num">{formatCurrency(end?.totalAssetValue ?? null, baseCurrency)}</td>
                <td className="num">{formatCurrency(end?.unrealizedPnL ?? null, baseCurrency)}</td>
              </tr>
            </tbody>
          </table>
          <PeriodComparison start={start} end={end} currency={baseCurrency} />
        </div>

        <div className="card">
          <h2>자산군별 비중 (조회 기준일)</h2>
          {asOf && asOf.positions.length > 0 ? (
            <AllocationTable valuation={asOf} currency={baseCurrency} />
          ) : (
            <div className="empty">해당 시점에 보유 자산이 없습니다.</div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <h2 style={{ margin: 0 }}>{formatDate(asOf?.asOf)} 보유 종목</h2>
          {asOf ? <StatusBadge status={asOf.dataStatus} /> : null}
        </div>
        {asOf && asOf.positions.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>종목</th>
                <th className="num">수량</th>
                <th className="num">가격</th>
                <th className="num">평가금액</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {asOf.positions.map((position) => (
                <tr key={position.instrumentId}>
                  <td>
                    {position.name}
                    <div className="muted" style={{ fontSize: 11 }}>
                      {position.symbol}
                    </div>
                  </td>
                  <td className="num">{formatQuantity(position.quantity)}</td>
                  <td className="num">
                    {position.price === null
                      ? "—"
                      : formatPrice(position.price, position.priceCurrency)}
                  </td>
                  <td className="num">
                    {position.marketValueBase === null
                      ? "평가 불가"
                      : formatCurrency(position.marketValueBase, baseCurrency)}
                  </td>
                  <td>
                    <StatusBadge status={position.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">해당 시점의 보유 종목이 없습니다.</div>
        )}
        <p className="muted" style={{ fontSize: 12 }}>
          기준 시각 {formatDateTime(asOf?.asOf)}
        </p>
      </div>
    </>
  );
}

function PeriodComparison({
  start,
  end,
  currency,
}: {
  start: Valuation | null;
  end: Valuation | null;
  currency: string;
}) {
  if (
    !start ||
    !end ||
    start.dataStatus === "UNAVAILABLE" ||
    end.dataStatus === "UNAVAILABLE" ||
    start.totalAssetValue === null ||
    end.totalAssetValue === null
  ) {
    return <div className="empty">기간 비교를 위한 평가 데이터가 부족합니다.</div>;
  }
  const change = end.totalAssetValue - start.totalAssetValue;
  const rate = start.totalAssetValue === 0 ? null : (change / start.totalAssetValue) * 100;
  return (
    <div style={{ marginTop: 12 }}>
      <div className="metric-label">기간 변동</div>
      <div className={`metric-value small ${change > 0 ? "up" : change < 0 ? "down" : ""}`}>
        {formatCurrency(change, currency)} ({formatPercent(rate)})
      </div>
    </div>
  );
}

function AllocationTable({ valuation, currency }: { valuation: Valuation; currency: string }) {
  const totals = new Map<string, number>();
  let grand = 0;
  for (const position of valuation.positions) {
    if (position.marketValueBase === null || position.status === "UNAVAILABLE") continue;
    totals.set(position.assetType, (totals.get(position.assetType) ?? 0) + position.marketValueBase);
    grand += position.marketValueBase;
  }
  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) return <div className="empty">평가 가능한 자산이 없습니다.</div>;
  return (
    <table>
      <thead>
        <tr>
          <th>자산군</th>
          <th className="num">평가금액</th>
          <th className="num">비중</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([key, value]) => (
          <tr key={key}>
            <td>{key}</td>
            <td className="num">{formatCurrency(value, currency)}</td>
            <td className="num">{grand === 0 ? "—" : formatPercent((value / grand) * 100)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
