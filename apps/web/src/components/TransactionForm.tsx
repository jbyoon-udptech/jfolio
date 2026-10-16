"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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

export interface Option {
  value: string;
  label: string;
}

/** FR-033: ledger entry form. Posts to the Next.js proxy route. */
export function TransactionForm({
  portfolios,
  instruments,
}: {
  portfolios: Option[];
  instruments: Option[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setError(null);
    setMessage(null);

    const timestampRaw = String(data.get("timestamp") ?? "");
    const body = {
      portfolioId: String(data.get("portfolioId") ?? ""),
      instrumentId: String(data.get("instrumentId") ?? ""),
      type: String(data.get("type") ?? ""),
      // `datetime-local` has no zone; interpret it as the browser's local time.
      timestamp: timestampRaw ? new Date(timestampRaw).toISOString() : new Date().toISOString(),
      quantity: Number(data.get("quantity")),
      price: Number(data.get("price")),
      fee: Number(data.get("fee") ?? 0),
      memo: (data.get("memo") as string) || null,
    };

    try {
      const res = await fetch("/api/transactions", {
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
      form.reset();
      setMessage("거래가 등록되었습니다.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="card" onSubmit={onSubmit} style={{ marginBottom: 16 }}>
      <h2>거래 등록</h2>
      <div className="form-grid">
        <label>
          포트폴리오
          <select name="portfolioId" required defaultValue={portfolios[0]?.value ?? ""}>
            {portfolios.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          자산
          <select name="instrumentId" required defaultValue="">
            <option value="" disabled>
              선택
            </option>
            {instruments.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          유형
          <select name="type" required defaultValue="BUY">
            {TRANSACTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          일시
          <input type="datetime-local" name="timestamp" required defaultValue={localNow()} />
        </label>
        <label>
          수량
          <input type="number" name="quantity" step="any" required />
        </label>
        <label>
          단가
          <input type="number" name="price" step="any" defaultValue={0} />
        </label>
        <label>
          수수료
          <input type="number" name="fee" step="any" defaultValue={0} />
        </label>
        <label>
          메모
          <input type="text" name="memo" maxLength={1024} />
        </label>
      </div>
      <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
        <button type="submit" className="primary" disabled={pending}>
          {pending ? "등록 중…" : "거래 등록"}
        </button>
        {message ? <span className="badge ok">{message}</span> : null}
        {error ? <span className="badge error">{error}</span> : null}
      </div>
    </form>
  );
}

/** `YYYY-MM-DDTHH:mm` in local time, suitable for `datetime-local`. */
function localNow(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}
