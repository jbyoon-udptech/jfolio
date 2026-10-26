"use client";

import { apiFetch } from "@/lib/client-fetch";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Option } from "@/components/TransactionForm";
import type { Transaction } from "@/lib/types";
import {
  formatCurrency,
  formatDateTime,
  formatPrice,
  formatQuantity,
  toLocalDateTimeInput,
} from "@/lib/format";

const TRANSACTION_TYPES = [
  "BUY",
  "SELL",
  "DEPOSIT",
  "WITHDRAWAL",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "DIVIDEND",
  "INTEREST",
  "FEE",
  "SPLIT",
  "ADJUSTMENT",
] as const;

/**
 * FR-033 / FR-034: a ledger row that can be edited in place or deleted.
 *
 * The portfolio can be reassigned. The instrument is intentionally fixed:
 * changing the asset of an existing entry would leave the stored currency
 * inconsistent with the new instrument. Delete the row and record it again
 * instead.
 */
export function TransactionRow({
  transaction,
  name,
  symbol,
  portfolioName,
  portfolioOptions,
}: {
  transaction: Transaction;
  name?: string;
  symbol?: string;
  portfolioName?: string;
  portfolioOptions: Option[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState(transaction.type);
  const [portfolioId, setPortfolioId] = useState(transaction.portfolioId);
  const [timestamp, setTimestamp] = useState(toLocalDateTimeInput(transaction.timestamp));
  const [quantity, setQuantity] = useState(String(transaction.quantity));
  const [price, setPrice] = useState(String(transaction.price));
  const [fee, setFee] = useState(String(transaction.fee));
  const [memo, setMemo] = useState(transaction.memo ?? "");

  function reset() {
    setType(transaction.type);
    setPortfolioId(transaction.portfolioId);
    setTimestamp(toLocalDateTimeInput(transaction.timestamp));
    setQuantity(String(transaction.quantity));
    setPrice(String(transaction.price));
    setFee(String(transaction.fee));
    setMemo(transaction.memo ?? "");
    setError(null);
  }

  async function save() {
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/transactions/${transaction.transactionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          portfolioId,
          // `datetime-local` has no zone; interpret it as the browser's local time.
          timestamp: timestamp ? new Date(timestamp).toISOString() : transaction.timestamp,
          quantity: Number(quantity),
          price: Number(price),
          fee: Number(fee),
          memo: memo.trim() === "" ? null : memo,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(payload?.error?.message ?? `요청 실패 (${res.status})`);
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!window.confirm("이 거래를 삭제할까요? 삭제하면 이후 평가 스냅샷이 다시 계산됩니다.")) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/transactions/${transaction.transactionId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(payload?.error?.message ?? `요청 실패 (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setPending(false);
    }
  }

  // The asset itself is fixed while editing, so both branches render the same
  // name/code cells. The name links to the asset master; the code is secondary.
  const instrumentCells = (
    <>
      <td>
        {name ? (
          <a href={`/assets/${transaction.instrumentId}`}>{name}</a>
        ) : (
          transaction.instrumentId
        )}
      </td>
      <td className="muted">{symbol ?? "—"}</td>
    </>
  );

  const portfolioCell = (
    <td>
      {portfolioName ? (
        <a href={`/portfolio?portfolioId=${transaction.portfolioId}`}>{portfolioName}</a>
      ) : (
        <span className="muted">—</span>
      )}
    </td>
  );

  const portfolioEditCell = (
    <td>
      <select
        value={portfolioId}
        onChange={(event) => setPortfolioId(event.target.value)}
        aria-label="포트폴리오"
      >
        {portfolioOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </td>
  );

  if (editing) {
    return (
      <tr>
        <td>
          <input
            type="datetime-local"
            value={timestamp}
            onChange={(event) => setTimestamp(event.target.value)}
            aria-label="일시"
          />
        </td>
        <td>
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            aria-label="유형"
          >
            {TRANSACTION_TYPES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </td>
        {portfolioOptions.length > 0 ? portfolioEditCell : portfolioCell}
        {instrumentCells}
        <td className="num">
          <input
            type="number"
            step="any"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            aria-label="수량"
            style={{ width: 110 }}
          />
        </td>
        <td className="num">
          <input
            type="number"
            step="any"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            aria-label="단가"
            style={{ width: 110 }}
          />
        </td>
        <td className="num">
          <input
            type="number"
            step="any"
            value={fee}
            onChange={(event) => setFee(event.target.value)}
            aria-label="수수료"
            style={{ width: 100 }}
          />
        </td>
        <td>
          <input
            type="text"
            value={memo}
            maxLength={1024}
            onChange={(event) => setMemo(event.target.value)}
            aria-label="메모"
            style={{ width: 160 }}
          />
        </td>
        <td>
          <div className="toolbar" style={{ marginBottom: 0, gap: 6 }}>
            <button type="button" className="primary" disabled={pending} onClick={save}>
              저장
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setEditing(false);
                reset();
              }}
            >
              취소
            </button>
            {error ? (
              <span className="badge error" title={error}>
                오류
              </span>
            ) : null}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="muted">{formatDateTime(transaction.timestamp)}</td>
      <td>{transaction.type}</td>
      {portfolioCell}
      {instrumentCells}
      <td className="num">{formatQuantity(transaction.quantity)}</td>
      <td className="num">{formatPrice(transaction.price, transaction.currency)}</td>
      <td className="num">
        {formatCurrency(transaction.fee, transaction.feeCurrency ?? transaction.currency)}
      </td>
      <td className="muted">{transaction.memo ?? "—"}</td>
      <td>
        <div className="toolbar" style={{ marginBottom: 0, gap: 6 }}>
          <button type="button" disabled={pending} onClick={() => setEditing(true)}>
            수정
          </button>
          <button type="button" disabled={pending} onClick={remove}>
            삭제
          </button>
          {error ? (
            <span className="badge error" title={error}>
              오류
            </span>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
