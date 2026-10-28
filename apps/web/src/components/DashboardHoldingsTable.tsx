"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { groupHoldingsByCurrency } from "@/lib/holdings";
import {
  EMPTY,
  UNAVAILABLE,
  formatCurrency,
  formatPercent,
  formatPrice,
} from "@/lib/format";
import type { ValuedPosition } from "@/lib/types";

const ALL_CURRENCIES = "ALL";

function changeClass(value: number | null): string {
  if (value === null) return "";
  return value > 0 ? "up" : value < 0 ? "down" : "";
}

/**
 * Dashboard holdings grouped by trading currency. The API already sorts
 * `topHoldings` by base-currency value, so each group keeps that order.
 */
export function DashboardHoldingsTable({
  holdings,
  currency,
}: {
  holdings: ValuedPosition[];
  currency: string;
}) {
  const groups = useMemo(() => groupHoldingsByCurrency(holdings), [holdings]);
  const [selectedCurrency, setSelectedCurrency] = useState(ALL_CURRENCIES);
  const activeCurrency = groups.some(
    (group) => group.currency === selectedCurrency,
  )
    ? selectedCurrency
    : ALL_CURRENCIES;
  const visibleGroups =
    activeCurrency === ALL_CURRENCIES
      ? groups
      : groups.filter((group) => group.currency === activeCurrency);

  return (
    <div className="card">
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>보유 종목</h2>
        {groups.length > 0 ? (
          <div
            className="pill-row"
            style={{ marginLeft: "auto" }}
            role="group"
            aria-label="통화별 필터"
          >
            {[ALL_CURRENCIES, ...groups.map((group) => group.currency)].map(
              (option) => (
                <button
                  key={option}
                  type="button"
                  className={`pill ${activeCurrency === option ? "active" : ""}`}
                  aria-pressed={activeCurrency === option}
                  onClick={() => setSelectedCurrency(option)}
                >
                  {option === ALL_CURRENCIES ? "전체" : option}
                </button>
              ),
            )}
          </div>
        ) : null}
      </div>

      {holdings.length === 0 ? (
        <div className="empty">보유 종목이 없습니다.</div>
      ) : (
        visibleGroups.map((group) => (
          <section
            key={group.currency}
            className="holdings-currency-group"
            aria-labelledby={`holdings-currency-${group.currency}`}
          >
            <div className="holdings-currency-head">
              <span
                className="holdings-currency-label"
                id={`holdings-currency-${group.currency}`}
              >
                {group.currency}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                {group.items.length}종목
              </span>
            </div>
            <table className="holdings-table">
              <thead>
                <tr>
                  <th>종목</th>
                  <th className="num">
                    <span className="th-main">평가금액</span>
                    <span className="th-sub">현재가</span>
                  </th>
                  <th className="num">
                    <span className="th-main">수익율</span>
                    <span className="th-sub">전일대비</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((holding) => (
                  <tr key={holding.instrumentId}>
                    <td>
                      <Link href={`/assets/${holding.instrumentId}`}>
                        {holding.name}
                      </Link>
                      <div className="cell-sub muted">{holding.symbol}</div>
                    </td>
                    <td className="num">
                      {holding.marketValueBase === null
                        ? UNAVAILABLE
                        : formatCurrency(holding.marketValueBase, currency)}
                      <div className="cell-sub muted">
                        {holding.price === null
                          ? EMPTY
                          : formatPrice(holding.price, holding.priceCurrency)}
                      </div>
                    </td>
                    <td
                      className={`num ${changeClass(holding.unrealizedReturn)}`}
                    >
                      {formatPercent(holding.unrealizedReturn)}
                      <div
                        className={`cell-sub ${changeClass(holding.dailyChangeRate)}`}
                      >
                        {formatPercent(holding.dailyChangeRate)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}
    </div>
  );
}
