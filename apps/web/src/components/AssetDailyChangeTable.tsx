import {
  EMPTY,
  formatAmount,
  formatMonthDay,
  formatPercent,
  formatPriceAmount,
} from "@/lib/format";
import type { AssetDailyPriceHistory } from "@/lib/types";

/**
 * UI-001: compact daily table for one portfolio. Dates are rows and assets are
 * columns; each cell shows the close and its move vs the previous available
 * close. A day without a quote stays blank instead of being carried forward.
 * The portfolio total is pinned right so the daily summary stays visible while
 * the asset columns scroll.
 */
export function AssetDailyChangeTable({ history }: { history: AssetDailyPriceHistory }) {
  if (history.series.length === 0) {
    return <div className="empty">보유 자산이 없습니다.</div>;
  }
  if (history.dates.length === 0) {
    return <div className="empty">최근 30일 가격 데이터가 없습니다.</div>;
  }

  return (
    <div className="table-scroll asset-daily-scroll">
      <table className="asset-daily-table">
        <thead>
          <tr>
            <th>날짜</th>
            {history.series.map((asset) => (
              <th
                key={asset.instrumentId}
                className="num"
                title={`${asset.name} (${asset.symbol})`}
                aria-label={`${asset.name} (${asset.symbol})`}
              >
                <span className="asset-daily-name">{asset.name}</span>
                <span className="asset-daily-currency">{asset.currency}</span>
              </th>
            ))}
            <th
              className="num asset-daily-total-head"
              title="현금 포함 일별 자산합계"
              aria-label="현금 포함 일별 자산합계"
            >
              <span className="asset-daily-name">합계</span>
              <span className="asset-daily-currency">{history.baseCurrency}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {history.dates.map((date, rowIndex) => {
            const total = history.totals[rowIndex];
            return (
              <tr key={date}>
                <td className="muted asset-daily-date">{formatMonthDay(date)}</td>
                {history.series.map((asset) => {
                  const point = asset.points[rowIndex];
                  if (!point || point.price === null) {
                    return (
                      <td key={asset.instrumentId} className="num muted">
                        {EMPTY}
                      </td>
                    );
                  }
                  return (
                    <td key={asset.instrumentId} className="num">
                      <div>{formatPriceAmount(point.price)}</div>
                      <div
                        className={`asset-daily-change ${changeClass(point.changeRate)}`}
                      >
                        {formatPercent(point.changeRate)}
                      </div>
                    </td>
                  );
                })}
                <td className="num asset-daily-total">
                  <div>{formatAmount(total?.totalAssetValue, history.baseCurrency)}</div>
                  <div
                    className={`asset-daily-change ${changeClass(total?.changeRate ?? null)}`}
                  >
                    {formatPercent(total?.changeRate ?? null)}
                  </div>
                </td>
              </tr>
            );
          })}
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
