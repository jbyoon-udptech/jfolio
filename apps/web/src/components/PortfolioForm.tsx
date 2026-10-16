"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Common base currencies offered as suggestions; any ISO code is accepted. */
const CURRENCIES = ["KRW", "USD", "JPY", "EUR"];

/** FR-030: create a portfolio. Posts to the Next.js proxy route. */
export function PortfolioForm() {
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

    const body = {
      name: String(data.get("name") ?? "").trim(),
      baseCurrency: String(data.get("baseCurrency") ?? "KRW"),
      isDefault: data.get("isDefault") === "on",
    };

    try {
      const res = await fetch("/api/portfolios", {
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
      setMessage("포트폴리오가 생성되었습니다.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="card" onSubmit={onSubmit} style={{ marginBottom: 16 }}>
      <h2>포트폴리오 생성</h2>
      <div className="form-grid">
        <label>
          이름
          <input name="name" required maxLength={128} placeholder="예: 퇴직연금" />
        </label>
        <label>
          기준 통화
          <select name="baseCurrency" defaultValue="KRW">
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input type="checkbox" name="isDefault" style={{ width: "auto" }} />기본 포트폴리오로
          설정
        </label>
      </div>
      <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
        <button type="submit" className="primary" disabled={pending}>
          {pending ? "생성 중…" : "포트폴리오 생성"}
        </button>
        {message ? <span className="badge ok">{message}</span> : null}
        {error ? <span className="badge error">{error}</span> : null}
      </div>
      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
        기준 통화는 평가금액·손익을 환산하는 통화입니다. 기본 포트폴리오는 대시보드에서 별도
        선택이 없을 때 사용됩니다.
      </p>
    </form>
  );
}
