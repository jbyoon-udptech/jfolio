"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Option } from "@/components/TransactionForm";

const SIGNAL_TYPES = ["PRICE_DROP", "PRICE_RISE", "PRICE_THRESHOLD", "PORTFOLIO_THRESHOLD"] as const;
const REFERENCE_TYPES = ["FIXED_PRICE", "PREVIOUS_CLOSE", "ROLLING_HIGH", "ROLLING_WINDOW"] as const;

/** UI-005: create a signal rule. */
export function SignalRuleForm({
  instruments,
  portfolios,
}: {
  instruments: Option[];
  portfolios: Option[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [referenceType, setReferenceType] = useState<string>("PREVIOUS_CLOSE");
  const [signalType, setSignalType] = useState<string>("PRICE_DROP");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setError(null);
    setMessage(null);

    const referenceValueRaw = String(data.get("referenceValue") ?? "").trim();
    const windowRaw = String(data.get("windowSeconds") ?? "").trim();
    const cooldownRaw = String(data.get("cooldownSeconds") ?? "").trim();
    const portfolioRaw = String(data.get("portfolioId") ?? "").trim();

    const body = {
      portfolioId: portfolioRaw === "" ? null : portfolioRaw,
      instrumentId: String(data.get("instrumentId") ?? ""),
      signalType,
      threshold: Number(data.get("threshold")),
      referenceType,
      referenceValue:
        referenceType === "FIXED_PRICE"
          ? Number(referenceValueRaw)
          : referenceValueRaw === ""
            ? null
            : Number(referenceValueRaw),
      windowSeconds: windowRaw === "" ? null : Number(windowRaw),
      cooldownSeconds: cooldownRaw === "" ? null : Number(cooldownRaw),
      isEnabled: true,
    };

    try {
      const res = await fetch("/api/signals/rules", {
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
      setMessage("시그널 규칙이 생성되었습니다.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="card" onSubmit={onSubmit} style={{ marginBottom: 16 }}>
      <h2>시그널 규칙 생성</h2>
      <div className="form-grid">
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
          포트폴리오 (선택)
          <select name="portfolioId" defaultValue="">
            <option value="">공통</option>
            {portfolios.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          시그널 유형
          <select value={signalType} onChange={(e) => setSignalType(e.target.value)}>
            {SIGNAL_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          기준 유형
          <select value={referenceType} onChange={(e) => setReferenceType(e.target.value)}>
            {REFERENCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          임계값
          <input
            type="number"
            name="threshold"
            step="any"
            min="0"
            required
            placeholder={thresholdHint(signalType)}
          />
        </label>
        {referenceType === "FIXED_PRICE" ? (
          <label>
            기준 가격
            <input type="number" name="referenceValue" step="any" required />
          </label>
        ) : null}
        {referenceType === "ROLLING_HIGH" || referenceType === "ROLLING_WINDOW" ? (
          <label>
            관측 기간 (초)
            <input type="number" name="windowSeconds" step="1" min="1" />
          </label>
        ) : null}
        <label>
          쿨다운 (초, 선택)
          <input type="number" name="cooldownSeconds" step="1" min="0" />
        </label>
      </div>
      <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
        <button type="submit" className="primary" disabled={pending}>
          {pending ? "생성 중…" : "규칙 생성"}
        </button>
        {message ? <span className="badge ok">{message}</span> : null}
        {error ? <span className="badge error">{error}</span> : null}
      </div>
      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
        임계값은 PRICE_DROP/PRICE_RISE의 경우 퍼센트, PRICE_THRESHOLD는 절대 가격,
        PORTFOLIO_THRESHOLD는 기준 통화 금액입니다.
      </p>
    </form>
  );
}

function thresholdHint(signalType: string): string {
  if (signalType === "PRICE_THRESHOLD") return "예: 50000";
  if (signalType === "PORTFOLIO_THRESHOLD") return "예: 100000000";
  return "예: 5 (=5%)";
}
