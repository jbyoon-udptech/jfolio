"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** SPEC 8.7 / UI: manually trigger a data collection run. */
export function CollectionTrigger() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/system/collection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      if (!res.ok) {
        throw new Error(payload?.error?.message ?? `요청 실패 (${res.status})`);
      }
      setMessage("수집을 실행했습니다.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="toolbar" style={{ marginBottom: 0 }}>
      <button type="button" className="primary" disabled={pending} onClick={run}>
        {pending ? "수집 중…" : "지금 수집 실행"}
      </button>
      {message ? <span className="badge ok">{message}</span> : null}
      {error ? <span className="badge error">{error}</span> : null}
    </div>
  );
}
