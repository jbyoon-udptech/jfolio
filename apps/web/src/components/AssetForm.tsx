"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AssetFields, EMPTY_ASSET_DRAFT, type AssetDraft } from "@/components/AssetFields";
import { parseProviders } from "@/lib/instrument";

/** FR-001: register a new asset in the master list. */
export function AssetForm() {
  const router = useRouter();
  const [draft, setDraft] = useState<AssetDraft>(EMPTY_ASSET_DRAFT);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function onChange(patch: Partial<AssetDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);

    try {
      const body = {
        name: draft.name.trim(),
        symbol: draft.symbol.trim(),
        assetType: draft.assetType,
        market: draft.market.trim(),
        currency: draft.currency.trim().toUpperCase(),
        isWatchlist: draft.isWatchlist,
        isActive: draft.isActive,
        providers: parseProviders(draft.providers),
      };
      const res = await fetch("/api/assets", {
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
      setDraft(EMPTY_ASSET_DRAFT);
      setMessage("자산이 등록되었습니다.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="card" onSubmit={onSubmit} style={{ marginBottom: 16 }}>
      <h2>자산 등록</h2>
      <AssetFields draft={draft} onChange={onChange} />
      <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
        <button type="submit" className="primary" disabled={pending}>
          {pending ? "등록 중…" : "자산 등록"}
        </button>
        {message ? <span className="badge ok">{message}</span> : null}
        {error ? <span className="badge error">{error}</span> : null}
      </div>
    </form>
  );
}
