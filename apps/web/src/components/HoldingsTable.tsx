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
  | "quantity"
  | "price"
  | "marketValueBase"
  | "costBasisBase"
  | "unrealizedPnL"
  | "unrealizedReturn";

const COLUMNS: Array<{ key: SortKey; label: string; num?: boolean }> = [
  { key: "name", label: "자산" },
  { key: "quantity", label: "수량", num: true },
  { key: "price", label: "현재가", num: true },
  { key: "marketValueBase", label: "평가금액", num: true },
  { key: "costBasisBase", label: "매입 원가", num: true },
  { key: "unrealizedPnL", label: "미실현 손익", num: true },
  { key: "unrealizedReturn", label: "수익률", num: true },
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
    const filtered = needle
      ? positions.filter(
          (p) =>
            p.name.toLowerCase().includes(needle) ||
            p.symbol.toLowerCase().includes(needle) ||
            p.assetType.toLowerCase().includes(needle),
        )
      : positions;
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
      {positions.length === 0 ? (
        <div className="empty">보유 자산이 없습니다.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th onClick={() => toggleSort("name")}>자산</th>
              <th>유형</th>
              {COLUMNS.filter((c) => c.key !== "name").map((column) => (
                <th
                  key={column.key}
                  className={column.num ? "num" : undefined}
                  onClick={() => toggleSort(column.key)}
                >
                  {column.label}
                  {sortKey === column.key ? (direction === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
              <th className="num">비중</th>
              <th>시세 기준</th>
              <th>상태</th>
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
                    <div className="muted" style={{ fontSize: 11 }}>
                      {position.symbol}
                    </div>
                  </td>
                  <td>{position.assetType}</td>
                  <td className="num">{formatQuantity(position.quantity)}</td>
                  <td className="num">
                    {position.price === null
                      ? "—"
                      : formatPrice(position.price, position.priceCurrency)}
                  </td>
                  <td className="num">
                    {position.marketValueBase === null
                      ? "평가 불가"
                      : formatCurrency(position.marketValueBase, currency)}
                  </td>
                  <td className="num">
                    {position.costBasisBase === null
                      ? "평가 불가"
                      : formatCurrency(position.costBasisBase, currency)}
                  </td>
                  <td
                    className={`num ${pnlClass(position.unrealizedPnL)}`}
                  >
                    {position.unrealizedPnL === null
                      ? "평가 불가"
                      : formatCurrency(position.unrealizedPnL, currency)}
                  </td>
                  <td className={`num ${pnlClass(position.unrealizedPnL)}`}>
                    {formatPercent(position.unrealizedReturn)}
                  </td>
                  <td className="num">{formatWeight(weight)}</td>
                  <td className="muted">{formatDateTime(position.priceTimestamp)}</td>
                  <td>
                    <StatusBadge status={position.status} />
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
