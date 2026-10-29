import Link from "next/link";
import { ApiErrorNotice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { PriceChart, type PricePoint } from "@/components/PriceChart";
import { StatusBadge } from "@/components/StatusBadge";
import { api, safe } from "@/lib/api";
import {
  formatCurrency,
  formatDateTime,
  formatPercent,
  formatPrice,
  formatQuantity,
} from "@/lib/format";
import { normalizePeriod, periodRange, PERIODS } from "@/lib/period";
import { resolvePortfolioSelection } from "@/lib/portfolio-selection";
import { readSelectedPortfolioCookie } from "@/lib/server-portfolio";
import type { ValuedPosition } from "@/lib/types";

export const dynamic = "force-dynamic";

/** UI-003: individual asset detail. */
export default async function AssetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { id } = await params;
  const search = await searchParams;
  const period = normalizePeriod(search.period);
  const range = periodRange(period);
  const cookiePortfolioId = await readSelectedPortfolioCookie();
  const instrumentResult = await safe(() => api.instrument(id));
  if (!instrumentResult.data) {
    return <ApiErrorNotice error={instrumentResult.error} />;
  }
  const instrument = instrumentResult.data;
  const latest = instrument.latestQuote ?? null;
  const priceCurrency = latest?.currency ?? instrument.currency;

  const [quotesResult, portfolioResult, signalsResult] = await Promise.all([
    safe(() =>
      api.quotes(id, {
        interval: range.interval === "hourly" ? undefined : "1d",
        // `ALL` has no client-side start date; omitting `from` returns the
        // newest 5000 observations, which covers the full daily history for a
        // typical portfolio.
        from: range.all ? undefined : range.from.toISOString(),
        to: range.to.toISOString(),
        limit: 5000,
      }),
    ),
    safe(() => api.portfolios()),
    safe(() => api.signalEvents({ instrumentId: id })),
  ]);

  // The intraday request intentionally includes every stored interval so live
  // quotes are not hidden behind the daily-close filter. Collapse rows that
  // share a timestamp before drawing the line.
  const quotes = [...(quotesResult.data?.items ?? [])]
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .filter(
      (quote, index, items) =>
        index === 0 || quote.timestamp !== items[index - 1]?.timestamp,
    );
  const pricePoints: PricePoint[] = quotes.map((quote) => ({
    timestamp: quote.timestamp,
    price: quote.price,
  }));
  const chartTitle =
    range.interval === "hourly"
      ? "기간별 가격 (시간별 시세)"
      : "기간별 가격 (일별 종가)";

  const portfolios = portfolioResult.data?.items ?? [];
  const selection = resolvePortfolioSelection({
    cookieValue: cookiePortfolioId,
    knownIds: portfolioResult.data?.items.map((p) => p.portfolioId),
  });
  const selectedPortfolio =
    selection.portfolioId !== undefined
      ? (portfolios.find((p) => p.portfolioId === selection.portfolioId) ?? null)
      : null;
  const valuationPortfolio =
    selectedPortfolio ?? portfolios.find((p) => p.isDefault) ?? portfolios[0] ?? null;

  const [valuationResult, transactionsResult] = await Promise.all([
    valuationPortfolio
      ? safe(() => api.valuation(valuationPortfolio.portfolioId))
      : Promise.resolve(null),
    safe(() =>
      api.transactions({
        instrumentId: id,
        portfolioId: selection.portfolioId,
        limit: 50,
      }),
    ),
  ]);

  const position: ValuedPosition | null =
    valuationResult?.data?.positions.find((p) => p.instrumentId === id) ?? null;
  const baseCurrency = valuationResult?.data?.baseCurrency ?? "KRW";
  const transactions = transactionsResult.data?.items ?? [];
  const signals = signalsResult.data?.items ?? [];

  // Prefer the provider-supplied change rate, otherwise derive it from the two
  // most recent daily closes. Missing data must never read as 0%.
  const changeRate = resolveChangeRate(latest?.changeRate ?? null, quotes);

  return (
    <>
      <PageHeader
        actions={
          <Link href="/assets" className="pill">
            ← 자산 목록
          </Link>
        }
        title={
          <>
            {instrument.name}{" "}
            <span className="muted" style={{ fontSize: 16 }}>
              {instrument.symbol}
            </span>
          </>
        }
        subtitle={
          <>
            {instrument.assetType} · {instrument.market} · {instrument.currency}
            {instrument.isWatchlist ? " · 관심종목" : ""}
            {instrument.isActive ? "" : " · 비활성"}
            {selectedPortfolio ? ` · ${selectedPortfolio.name}` : ""}
          </>
        }
      />

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="metric-label">현재가</div>
          <div className="metric-value">
            {latest ? formatPrice(latest.price, priceCurrency) : "데이터 없음"}
          </div>
          <div className={`metric-delta ${changeClass(changeRate)}`}>
            {changeRate === null ? (
              <span className="muted">전일 대비 데이터 없음</span>
            ) : (
              <span>{formatPercent(changeRate * 100)}</span>
            )}
          </div>
        </div>
        <div className="card">
          <div className="metric-label">거래량</div>
          <div className="metric-value small">
            {latest?.volume === undefined || latest.volume === null
              ? "제공되지 않음"
              : formatQuantity(latest.volume)}
          </div>
          <div className="metric-label" style={{ marginTop: 12 }}>
            최종 갱신
          </div>
          <div>{formatDateTime(latest?.timestamp)}</div>
        </div>
        <div className="card">
          <div className="metric-label">데이터 공급자</div>
          <div style={{ marginBottom: 10 }}>
            {instrument.providers.length === 0
              ? "—"
              : instrument.providers.map((p) => p.providerId).join(", ")}
          </div>
          <div className="metric-label">상태</div>
          <StatusBadge status={latest ? "NORMAL" : "NO_DATA"} />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="toolbar">
          <h2 style={{ margin: 0 }}>{chartTitle}</h2>
          <div className="pill-row" style={{ marginLeft: "auto" }}>
            {PERIODS.map((option) => (
              <Link
                key={option}
                href={`/assets/${id}?period=${option}`}
                className={`pill ${option === period ? "active" : ""}`}
              >
                {option}
              </Link>
            ))}
          </div>
        </div>
        <PriceChart
          points={pricePoints}
          currency={priceCurrency}
          interval={range.interval}
        />
        {pricePoints.some((point) => point.price === null) ? (
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            * 누락 구간은 보간하지 않고 선이 끊어져 표시됩니다.
          </div>
        ) : null}
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h2>보유 현황</h2>
          {position ? (
            <table>
              <tbody>
                <tr>
                  <th>보유 수량</th>
                  <td className="num">{formatQuantity(position.quantity)}</td>
                </tr>
                <tr>
                  <th>매입 원가</th>
                  <td className="num">{formatCurrency(position.costBasisBase, baseCurrency)}</td>
                </tr>
                <tr>
                  <th>평가금액</th>
                  <td className="num">
                    {position.marketValueBase === null
                      ? "평가 불가"
                      : formatCurrency(position.marketValueBase, baseCurrency)}
                  </td>
                </tr>
                <tr>
                  <th>평가손익</th>
                  <td className={`num ${changeClass(position.unrealizedPnL)}`}>
                    {position.unrealizedPnL === null
                      ? "평가 불가"
                      : formatCurrency(position.unrealizedPnL, baseCurrency)}{" "}
                    ({formatPercent(position.unrealizedReturn)})
                  </td>
                </tr>
                <tr>
                  <th>상태</th>
                  <td>
                    <StatusBadge status={position.status} />
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <div className="empty">이 자산에 대한 보유 내역이 없습니다.</div>
          )}
        </div>

        <div className="card">
          <h2>관련 시그널</h2>
          {signals.length === 0 ? (
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
                {signals.map((signal) => (
                  <tr key={signal.eventId}>
                    <td className="muted">{formatDateTime(signal.triggeredAt)}</td>
                    <td>{signal.signalType}</td>
                    <td className="num">{signal.observedPrice}</td>
                    <td className="num">{formatPercent(signal.changeRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <h2>
          거래 이력
          {selectedPortfolio ? (
            <span className="muted" style={{ fontSize: 13 }}>
              {" "}
              · {selectedPortfolio.name}
            </span>
          ) : null}
        </h2>
        {transactions.length === 0 ? (
          <div className="empty">거래 이력이 없습니다.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>일시</th>
                <th>유형</th>
                <th className="num">수량</th>
                <th className="num">단가</th>
                <th className="num">수수료</th>
                <th>메모</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.transactionId}>
                  <td className="muted">{formatDateTime(tx.timestamp)}</td>
                  <td>{tx.type}</td>
                  <td className="num">{formatQuantity(tx.quantity)}</td>
                  <td className="num">{formatPrice(tx.price, tx.currency)}</td>
                  <td className="num">{formatCurrency(tx.fee, tx.feeCurrency ?? tx.currency)}</td>
                  <td className="muted">{tx.memo ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function changeClass(value: number | null): string {
  if (value === null) return "";
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "";
}

/** Derive a day-over-day change fraction when the provider did not supply one. */
function resolveChangeRate(
  provided: number | null,
  quotes: Array<{ price: number; timestamp: string; interval: string }>,
): number | null {
  if (provided !== null && Number.isFinite(provided)) return provided;
  const daily = quotes
    .filter((q) => q.interval === "1d")
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const latest = daily.at(-1);
  const previous = daily.at(-2);
  if (!latest || !previous || previous.price === 0) return null;
  return latest.price / previous.price - 1;
}
