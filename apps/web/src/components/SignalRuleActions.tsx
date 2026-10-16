"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** UI-005: enable/disable and delete (deactivate) a signal rule. */
export function SignalRuleActions({ ruleId, isEnabled }: { ruleId: string; isEnabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: "PATCH" | "DELETE", body?: unknown) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/signals/rules/${ruleId}`, {
        method,
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
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

  return (
    <div className="toolbar" style={{ marginBottom: 0, gap: 6 }}>
      <button
        type="button"
        disabled={pending}
        onClick={() => call("PATCH", { isEnabled: !isEnabled })}
      >
        {isEnabled ? "비활성화" : "활성화"}
      </button>
      <button type="button" disabled={pending} onClick={() => call("DELETE")}>
        삭제
      </button>
      {error ? (
        <span className="badge error" title={error}>
          오류
        </span>
      ) : null}
    </div>
  );
}
