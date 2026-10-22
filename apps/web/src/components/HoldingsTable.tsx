"use client";

import { useMemo, useState } from "react";
import type { ValuedPosition } from "@/lib/types";
import {
  formatCurrency,
  formatDateTime,
  formatPercent,
  formatPrice,
  formatQuantity,
  formatWeight,
} from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";

type SortKey =
  | "name"
  | "price"
  | "marketValueBase"
  | "costBasisBase"
  | "unrealizedPnL"
  | "unrealizedReturn";

/**
 * Each column stacks a primary value over a secondary detail line, which keeps
 * the position table readable without eleven separate columns.
 */
const COLUMNS: Array<{
  key: SortKey;
  label: string;
  num?: boolean;
  sub?: { key?: SortKey; label: string };
}> = [
  { key: "name", label: "자산", sub: { label: "유형" } },
  {
    key: "price",
    label: "현재가(수량)",
    num: true,
    sub: { label: "매입평균가" },
  },
  {
    key: "marketValueBase",
    label: "평가금액",
    num: true,
    sub: { key: "costBasisBase", label: "매입 원가" },
  },
  {
    key: "unrealizedPnL",
    label: "미실현 손익",
    num: true,
    sub: { key: "unrealizedReturn", label: "수익률" },
  },
];

/** UI-002: holdings table with search and sortable columns. */
export function HoldingsTable({
  positions,
  currency,
  totalAssetValue,
}: {
  positions: ValuedPosition[];
  currency: string;
  totalAssetValue: number | null;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("marketValueBase");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    // Cash is reported in the separate 현금 잔고 card, so it is not a holding
    // and must not appear (or be searchable) in this table.
    const holdings = positions.filter((p) => p.assetType !== "CASH");
    const filtered = needle
      ? holdings.filter(
          (p) =>
            p.name.toLowerCase().includes(needle) ||
            p.symbol.toLowerCase().includes(needle) ||
            p.assetType.toLowerCase().includes(needle),
        )
      : holdings;
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" || typeof bv === "string") {
        return String(av).localeCompare(String(bv));
      }
      const an = av ?? Number.NEGATIVE_INFINITY;
      const bn = bv ?? Number.NEGATIVE_INFINITY;
      return an - bn;
    });
    return direction === "asc" ? sorted : sorted.reverse();
  }, [positions, query, sortKey, direction]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDirection("desc");
    }
  }

  /** Header label plus the active sort arrow, as a clickable sort control. */
  function sortButton(key: SortKey, label: string) {
    return (
      <button type="button" onClick={() => toggleSort(key)} title={`${label} 기준 정렬`}>
        {label}
        {sortKey === key ? (direction === "asc" ? " ▲" : " ▼") : null}
      </button>
    );
  }

  return (
    <div className="card">
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>보유 자산</h2>
        <input
          placeholder="종목명/코드 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginLeft: "auto", minWidth: 220 }}
        />
      </div>
      {rows.length === 0 ? (
        <div className="empty">
          {query.trim() ? "검색 결과가 없습니다." : "보유 자산이 없습니다."}
        </div>
      ) : (
        <table className="holdings-table">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th key={column.key} className={column.num ? "num" : undefined}>
                  <span className="th-main">
                    {sortButton(column.key, column.label)}
                  </span>
                  <span className="th-sub">
                    {column.sub?.key
                      ? sortButton(column.sub.key, column.sub.label)
                      : column.sub?.label}
                  </span>
                </th>
              ))}
              <th className="num">비중</th>
              <th>
                <span className="th-main">시세 기준</span>
                <span className="th-sub">상태</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((position) => {
              const weight =
                position.marketValueBase !== null &&
                totalAssetValue !== null &&
                totalAssetValue !== 0
                  ? (position.marketValueBase / totalAssetValue) * 100
                  : null;
              return (
                <tr key={position.instrumentId}>
                  <td>
                    <a href={`/assets/${position.instrumentId}`}>{position.name}</a>
                    <div className="cell-sub muted">
                      {position.symbol} {position.assetType}
                    </div>
                  </td>
                  <td className="num">
                    {position.price === null
                      ? "—"
                      : formatPrice(position.price, position.priceCurrency)}{" "}
                    ({formatQuantity(position.quantity)})
                    <div className="cell-sub muted">
                      {formatPrice(
                        position.costBasisBase !== null && position.quantity > 0
                          ? position.costBasisBase / position.quantity
                          : null,
                        currency,
                      )}
                    </div>
                  </td>
                  <td className="num">
                    {position.marketValueBase === null
                      ? "평가 불가"
                      : formatCurrency(position.marketValueBase, currency, {
                          maximumFractionDigits: 0,
                        })}
                    <div className="cell-sub muted">
                      {position.costBasisBase === null
                        ? "평가 불가"
                        : formatCurrency(position.costBasisBase, currency, {
                            maximumFractionDigits: 0,
                          })}
                    </div>
                  </td>
                  <td className={`num ${pnlClass(position.unrealizedPnL)}`}>
                    {position.unrealizedPnL === null
                      ? "평가 불가"
                      : formatCurrency(position.unrealizedPnL, currency, {
                          maximumFractionDigits: 0,
                        })}
                    <div className="cell-sub">
                      {formatPercent(position.unrealizedReturn)}
                    </div>
                  </td>
                  <td className="num">{formatWeight(weight)}</td>
                  <td>
                    <div className="muted">
                      {formatDateTime(position.priceTimestamp)}
                    </div>
                    <div className="cell-sub">
                      <StatusBadge status={position.status} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function pnlClass(value: number | null): string {
  if (value === null) return "";
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "";
}
