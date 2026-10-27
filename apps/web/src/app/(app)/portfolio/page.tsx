import { HoldingsTable } from "@/components/HoldingsTable";
import { ApiErrorNotice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { PortfolioSelect } from "@/components/PortfolioSelect";
import { StatusBadge } from "@/components/StatusBadge";
import type { Option } from "@/components/TransactionForm";
import { api, safe } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { resolvePortfolioSelection } from "@/lib/portfolio-selection";
import { readSelectedPortfolioCookie } from "@/lib/server-portfolio";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** UI-002: portfolio holdings list. */
export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ portfolioId?: string }>;
}) {
  const params = await searchParams;
  const cookiePortfolioId = await readSelectedPortfolioCookie();
  const portfoliosResult = await safe(() => api.portfolios());
  const selection = resolvePortfolioSelection({
    searchValue: params.portfolioId,
    cookieValue: cookiePortfolioId,
    knownIds: portfoliosResult.data?.items.map((p) => p.portfolioId),
  });
  if (selection.invalidExplicit) {
    redirect("/portfolio");
  }

  const dashboardResult = await safe(() =>
    api.dashboard({ portfolioId: selection.portfolioId }),
  );
  if (!dashboardResult.data) {
    return <ApiErrorNotice error={dashboardResult.error} />;
  }
  const portfolioId = dashboardResult.data.portfolioId;
  const holdingsResult = await safe(() => api.holdings(portfolioId));
  if (!holdingsResult.data) {
    return <ApiErrorNotice error={holdingsResult.error} />;
  }
  const holdings = holdingsResult.data;
  const portfolioOptions: Option[] = (portfoliosResult.data?.items ?? []).map((p) => ({
    value: p.portfolioId,
    label: `${p.name} (${p.baseCurrency})`,
  }));
  const total = holdings.items.reduce(
    (sum, p) => sum + (p.marketValueBase ?? 0),
    0,
  );

  return (
    <>
      <PageHeader
        selector={
          portfolioOptions.length > 0 ? (
            <PortfolioSelect
              portfolios={portfolioOptions}
              currentId={portfolioId}
              explicitPortfolioId={params.portfolioId}
            />
          ) : undefined
        }
        actions={
          <>
            <a className="btn" href={`/transactions?portfolioId=${portfolioId}`}>
              거래 내역 편집
            </a>
            <StatusBadge status={holdings.dataStatus} />
          </>
        }
        title="보유 자산"
        subtitle={`${holdings.baseCurrency} 기준 · ${formatDateTime(holdings.asOf)}`}
      />

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="metric-label">평가금액 합계</div>
          <div className="metric-value small">
            {formatCurrency(total, holdings.baseCurrency)}
          </div>
        </div>
        <div className="card">
          <div className="metric-label">보유 종목 수</div>
          <div className="metric-value small">{holdings.items.length}</div>
        </div>
        <div className="card">
          <div className="metric-label">평가 불가 종목</div>
          <div className="metric-value small">{holdings.unavailableCount}</div>
        </div>
      </div>

      {holdings.cashBalances.length > 0 ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>현금 잔고</h2>
          <table>
            <thead>
              <tr>
                <th>통화</th>
                <th className="num">수량</th>
                <th className="num">기준 통화 환산</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {holdings.cashBalances.map((cash) => (
                <tr key={cash.currency}>
                  <td>{cash.currency}</td>
                  <td className="num">{cash.amount}</td>
                  <td className="num">
                    {cash.valueInBaseCurrency === null
                      ? "평가 불가"
                      : formatCurrency(cash.valueInBaseCurrency, holdings.baseCurrency)}
                  </td>
                  <td>
                    <StatusBadge status={cash.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <HoldingsTable
        positions={holdings.items}
        currency={holdings.baseCurrency}
        totalAssetValue={total}
      />
    </>
  );
}
