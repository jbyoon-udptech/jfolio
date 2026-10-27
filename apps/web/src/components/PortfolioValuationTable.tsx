import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
  formatWeight,
} from "@/lib/format";
import type { PortfolioDashboardSummary } from "@/lib/types";

/** Per-portfolio valuation rows for the `All` dashboard. */
export function PortfolioValuationTable({
  summaries,
  currency,
}: {
  summaries: PortfolioDashboardSummary[];
  currency: string;
}) {
  if (summaries.length === 0) {
    return <div className="empty">표시할 포트폴리오가 없습니다.</div>;
  }

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>포트폴리오</th>
            <th className="num">평가금액</th>
            <th className="num">비중</th>
            <th className="num" title="오늘자 전일대비 등락">
              전일대비
            </th>
            <th className="num">수익률</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((summary) => (
            <tr key={summary.portfolioId}>
              <td>
                <Link href={`/portfolio?portfolioId=${encodeURIComponent(summary.portfolioId)}`}>
                  {summary.name}
                </Link>
                <div className="muted" style={{ fontSize: 11 }}>
                  {summary.nativeBaseCurrency}
                </div>
              </td>
              <td className="num">
                {formatCurrency(summary.totalAssetValue, currency)}
              </td>
              <td className="num">{formatWeight(summary.weight)}</td>
              <td className={`num ${changeClass(summary.dailyChange)}`}>
                {formatSignedCurrency(summary.dailyChange, currency)}
                <div className="muted" style={{ fontSize: 11 }}>
                  {formatPercent(summary.dailyChangeRate)}
                </div>
              </td>
              <td className={`num ${changeClass(summary.unrealizedPnL)}`}>
                {formatPercent(summary.unrealizedReturn)}
              </td>
              <td>
                <StatusBadge status={summary.dataStatus} />
                {summary.unavailableCount > 0 ? (
                  <div className="muted" style={{ fontSize: 11 }}>
                    평가 불가 {summary.unavailableCount}건
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function changeClass(value: number | null): string {
  if (value === null) return "";
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "";
}
