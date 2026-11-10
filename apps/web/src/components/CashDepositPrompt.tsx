"use client";

import { apiFetch } from "@/lib/client-fetch";
import type { CashSettlementOption } from "@/lib/cash-settlement";
import {
  formatCurrency,
  formatNumber,
  formatPrice,
  toLocalDateTimeInput,
} from "@/lib/format";
import { useState } from "react";

export interface CashDepositPromptProps {
  portfolioId: string;
  portfolioLabel: string;
  saleLabel: string;
  currency: string;
  quantity: number;
  price: number;
  fee: number;
  /** Net proceeds after the sale fee. */
  amount: number;
  /** ISO timestamp of the sale. */
  timestamp: string;
  cashOptions: CashSettlementOption[];
  onComplete: (message: string) => void;
  onSkip: () => void;
}

/**
 * Optional follow-up to a SELL: the ledger keeps cash separate, so offer a
 * prefilled DEPOSIT for the net proceeds instead of creating one silently.
 */
export function CashDepositPrompt({
  portfolioId,
  portfolioLabel,
  saleLabel,
  currency,
  quantity,
  price,
  fee,
  amount,
  timestamp,
  cashOptions,
  onComplete,
  onSkip,
}: CashDepositPromptProps) {
  const [instrumentId, setInstrumentId] = useState(cashOptions[0]?.value ?? "");
  const [amountValue, setAmountValue] = useState(String(amount));
  const [timestampValue, setTimestampValue] = useState(() =>
    toLocalDateTimeInput(timestamp),
  );
  const [memo, setMemo] = useState(`${saleLabel} 매도 대금`);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const depositQuantity = Number(amountValue);
    if (!Number.isFinite(depositQuantity) || depositQuantity <= 0) {
      setError("입금 금액은 0보다 커야 합니다.");
      return;
    }
    if (!instrumentId) {
      setError("현금 자산을 선택하세요.");
      return;
    }

    setPending(true);
    setError(null);
    const parsedTimestamp = new Date(timestampValue);
    const body = {
      portfolioId,
      instrumentId,
      type: "DEPOSIT",
      timestamp: Number.isNaN(parsedTimestamp.getTime())
        ? new Date().toISOString()
        : parsedTimestamp.toISOString(),
      quantity: depositQuantity,
      price: 1,
      fee: 0,
      memo: memo.trim() || null,
    };

    try {
      const res = await apiFetch("/api/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(payload?.error?.message ?? `요청 실패 (${res.status})`);
      }
      onComplete("현금 입금 거래가 추가되었습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setPending(false);
    }
  }

  if (cashOptions.length === 0) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>매도 대금 현금 입금</h2>
        <div className="notice">
          {currency} 현금(CASH) 자산이 없어 입금 거래를 준비하지 못했습니다.{" "}
          <a href="/assets">자산 목록</a>에서 {currency} CASH 자산을 등록한 뒤
          거래 내역에서 DEPOSIT 거래를 추가하세요.
        </div>
        <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
          <button type="button" onClick={onSkip}>
            닫기
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={onSubmit} style={{ marginBottom: 16 }}>
      <h2>매도 대금 현금 입금</h2>
      <p className="muted">
        {saleLabel} {formatNumber(quantity, { maximumFractionDigits: 8 })}주 ×{" "}
        {formatPrice(price, currency)}
        {fee > 0 ? ` (수수료 ${formatCurrency(fee, currency)})` : ""} → 순수령액{" "}
        {formatCurrency(amount, currency)}. 현금 잔고에 반영하려면 아래 입금
        거래를 추가하세요.
      </p>
      <div className="form-grid">
        <label>
          포트폴리오
          <input value={portfolioLabel} readOnly />
        </label>
        <label>
          현금 자산
          <select
            name="instrumentId"
            value={instrumentId}
            onChange={(event) => setInstrumentId(event.target.value)}
            required
          >
            {cashOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          입금 금액 ({currency})
          <input
            type="number"
            name="quantity"
            step="any"
            min="0"
            value={amountValue}
            onChange={(event) => setAmountValue(event.target.value)}
            required
          />
        </label>
        <label>
          일시
          <input
            type="datetime-local"
            name="timestamp"
            value={timestampValue}
            onChange={(event) => setTimestampValue(event.target.value)}
            required
          />
        </label>
        <label>
          메모
          <input
            type="text"
            name="memo"
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            maxLength={1024}
          />
        </label>
      </div>
      <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
        <button type="submit" className="primary" disabled={pending}>
          {pending ? "추가 중…" : "현금 입금 추가"}
        </button>
        <button type="button" onClick={onSkip} disabled={pending}>
          건너뛰기
        </button>
        {error ? <span className="badge error">{error}</span> : null}
      </div>
    </form>
  );
}
