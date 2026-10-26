"use client";

import { apiFetch } from "@/lib/client-fetch";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Portfolio } from "@/lib/types";

/** FR-030: inline rename / re-base, "make default" and hide/restore for a portfolio row. */
export function PortfolioRowActions({ portfolio }: { portfolio: Portfolio }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(portfolio.name);
  const [baseCurrency, setBaseCurrency] = useState(portfolio.baseCurrency);

  async function patch(body: unknown) {
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/portfolios/${portfolio.portfolioId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
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

  if (editing) {
    return (
      <div className="toolbar" style={{ marginBottom: 0, gap: 6 }}>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label="이름"
          maxLength={128}
          style={{ width: 150 }}
        />
        <input
          value={baseCurrency}
          onChange={(event) => setBaseCurrency(event.target.value.toUpperCase())}
          aria-label="기준 통화"
          maxLength={5}
          style={{ width: 76 }}
        />
        <button
          type="button"
          className="primary"
          disabled={pending || name.trim() === ""}
          onClick={() => patch({ name: name.trim(), baseCurrency })}
        >
          저장
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setEditing(false);
            setError(null);
            setName(portfolio.name);
            setBaseCurrency(portfolio.baseCurrency);
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
    );
  }

  return (
    <div className="toolbar" style={{ marginBottom: 0, gap: 6 }}>
      <button type="button" disabled={pending} onClick={() => setEditing(true)}>
        수정
      </button>
      {!portfolio.isDefault ? (
        <button type="button" disabled={pending} onClick={() => patch({ isDefault: true })}>
          기본으로
        </button>
      ) : null}
      {!portfolio.isDefault || portfolio.isHidden ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => patch({ isHidden: !portfolio.isHidden })}
        >
          {portfolio.isHidden ? "다시 표시" : "숨기기"}
        </button>
      ) : null}
      {error ? (
        <span className="badge error" title={error}>
          오류
        </span>
      ) : null}
    </div>
  );
}
