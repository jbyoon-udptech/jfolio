"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AssetFields, type AssetDraft } from "@/components/AssetFields";
import { formatDateTime, formatPrice } from "@/lib/format";
import { formatProviders, parseProviders } from "@/lib/instrument";
import type { Instrument } from "@/lib/types";

function toDraft(instrument: Instrument): AssetDraft {
  return {
    name: instrument.name,
    symbol: instrument.symbol,
    assetType: instrument.assetType,
    market: instrument.market,
    currency: instrument.currency,
    providers: formatProviders(instrument.providers),
    isWatchlist: instrument.isWatchlist,
    isActive: instrument.isActive,
  };
}

/**
 * FR-001: a single asset master row with an expandable inline editor.
 * Deletion is a soft delete (`isActive=false`) so history is preserved, and an
 * inactive asset can be restored from the same row.
 */
export function AssetRow({ instrument }: { instrument: Instrument }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<AssetDraft>(() => toDraft(instrument));

  function onChange(patch: Partial<AssetDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function closeEditor() {
    setEditing(false);
    setDraft(toDraft(instrument));
    setError(null);
  }

  async function patch(body: unknown): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/assets/${instrument.instrumentId}`, {
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
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
      return false;
    } finally {
      setPending(false);
    }
  }

  async function save() {
    let providers;
    try {
      providers = parseProviders(draft.providers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "공급자 형식 오류");
      return;
    }
    await patch({
      name: draft.name.trim(),
      symbol: draft.symbol.trim(),
      assetType: draft.assetType,
      market: draft.market.trim(),
      currency: draft.currency.trim().toUpperCase(),
      isWatchlist: draft.isWatchlist,
      isActive: draft.isActive,
      providers,
    });
  }

  async function deactivate() {
    if (!window.confirm("이 자산을 비활성화할까요? 과거 거래·시세 이력은 유지됩니다.")) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/assets/${instrument.instrumentId}`, { method: "DELETE" });
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

  const latest = instrument.latestQuote ?? null;

  return (
    <>
      <tr>
        <td>
          <Link href={`/assets/${instrument.instrumentId}`}>{instrument.name}</Link>{" "}
          {instrument.isWatchlist ? <span className="badge warn">관심</span> : null}{" "}
          {instrument.isActive ? null : <span className="badge muted">비활성</span>}
        </td>
        <td>{instrument.symbol}</td>
        <td>{instrument.assetType}</td>
        <td>{instrument.market}</td>
        <td>{instrument.currency}</td>
        <td className="num">
          {latest ? formatPrice(latest.price, latest.currency) : <span className="muted">—</span>}
        </td>
        <td className="muted">{latest ? formatDateTime(latest.timestamp) : "—"}</td>
        <td className="muted">
          {instrument.providers.map((link) => link.providerId).join(", ") || "—"}
        </td>
        <td>
          <div className="toolbar" style={{ marginBottom: 0, gap: 6 }}>
            <button
              type="button"
              disabled={pending}
              onClick={() => (editing ? closeEditor() : setEditing(true))}
            >
              {editing ? "닫기" : "수정"}
            </button>
            {instrument.isActive ? (
              <button type="button" disabled={pending} onClick={deactivate}>
                삭제
              </button>
            ) : (
              <button type="button" disabled={pending} onClick={() => patch({ isActive: true })}>
                복원
              </button>
            )}
            {!editing && error ? (
              <span className="badge error" title={error}>
                오류
              </span>
            ) : null}
          </div>
        </td>
      </tr>
      {editing ? (
        <tr>
          <td colSpan={9} style={{ background: "var(--panel-2)" }}>
            <AssetFields draft={draft} onChange={onChange} />
            <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
              <button type="button" className="primary" disabled={pending} onClick={save}>
                {pending ? "저장 중…" : "저장"}
              </button>
              <button type="button" disabled={pending} onClick={closeEditor}>
                취소
              </button>
              {error ? (
                <span className="badge error" title={error}>
                  {error}
                </span>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
