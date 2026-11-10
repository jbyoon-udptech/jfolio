"use client";

import { ALL_PORTFOLIOS_ID } from "@jfolio/shared";
import { apiFetch } from "@/lib/client-fetch";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toLocalDateTimeInput } from "@/lib/format";
import { findCashOptions, netSaleProceeds } from "@/lib/cash-settlement";
import {
  CashDepositPrompt,
  type CashDepositPromptProps,
} from "@/components/CashDepositPrompt";

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
  /** Present on instrument options; enables the post-sale cash prompt. */
  currency?: string;
  assetType?: string;
}

export interface OptionGroup {
  label: string;
  options: Option[];
}

/** Prefilled cash DEPOSIT offered after a successful SELL. */
type Settlement = Omit<CashDepositPromptProps, "onComplete" | "onSkip">;

/** FR-033: ledger entry form. Posts to the Next.js proxy route. */
export function TransactionForm({
  portfolios,
  instruments,
  selectedPortfolioId,
}: {
  portfolios: Option[];
  instruments: OptionGroup[];
  /**
   * Portfolio chosen by the page-level selector. The form follows it, including
   * the all-portfolios sentinel (which cannot receive a transaction).
   */
  selectedPortfolioId?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  // Bumping this remounts the uncontrolled fields after a successful submit
  // without touching the read-only portfolio field.
  const [formVersion, setFormVersion] = useState(0);

  // The page-level selector is the single source of truth: keep this field
  // read-only so the form can never diverge from the ledger view beside it.
  const fallbackPortfolioId = portfolios[0]?.value ?? "";
  const portfolioId = selectedPortfolioId ?? fallbackPortfolioId;
  const allSelected = portfolioId === ALL_PORTFOLIOS_ID;
  const canSubmit = Boolean(portfolioId) && !allSelected;
  const portfolioLabel = allSelected
    ? "전체 포트폴리오"
    : (portfolios.find((option) => option.value === portfolioId)?.label ??
      portfolioId);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      setError("거래를 등록할 포트폴리오를 선택하세요.");
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setError(null);
    setMessage(null);
    setSettlement(null);

    const timestampRaw = String(data.get("timestamp") ?? "");
    const body = {
      portfolioId,
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
      setFormVersion((version) => version + 1);
      setMessage("거래가 등록되었습니다.");
      router.refresh();

      // A SELL never moves cash by itself: offer the matching DEPOSIT instead of
      // silently creating a second transaction the user did not ask for.
      const instrumentOptions = instruments.flatMap((group) => group.options);
      const instrument = instrumentOptions.find(
        (option) => option.value === body.instrumentId,
      );
      const amount = netSaleProceeds(body.quantity, body.price, body.fee);
      if (body.type === "SELL" && instrument?.currency && amount > 0) {
        setSettlement({
          portfolioId: body.portfolioId,
          portfolioLabel:
            portfolios.find((option) => option.value === body.portfolioId)?.label ??
            body.portfolioId,
          saleLabel: instrument.label,
          currency: instrument.currency,
          quantity: body.quantity,
          price: body.price,
          fee: body.fee,
          amount,
          timestamp: body.timestamp,
          cashOptions: findCashOptions(instrumentOptions, instrument.currency),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {settlement ? (
        <CashDepositPrompt
          {...settlement}
          onComplete={(completed) => {
            setSettlement(null);
            setMessage(completed);
            router.refresh();
          }}
          onSkip={() => setSettlement(null)}
        />
      ) : null}
      <form
        key={formVersion}
        className="card"
        onSubmit={onSubmit}
        style={{ marginBottom: 16 }}
      >
        <h2>거래 등록</h2>
        <div className="form-grid">
          <label>
            포트폴리오
            <input value={portfolioLabel} readOnly />
          </label>
          <label>
            자산
            <select name="instrumentId" required defaultValue="">
              <option value="" disabled>
                선택
              </option>
              {instruments.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
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
          <button type="submit" className="primary" disabled={pending || !canSubmit}>
            {pending ? "등록 중…" : "거래 등록"}
          </button>
          {allSelected ? (
            <span className="muted">상단에서 거래할 포트폴리오를 선택하세요.</span>
          ) : null}
          {message ? <span className="badge ok">{message}</span> : null}
          {error ? <span className="badge error">{error}</span> : null}
        </div>
      </form>
    </>
  );
}

/** `YYYY-MM-DDTHH:mm` in local time, suitable for `datetime-local`. */
function localNow(): string {
  return toLocalDateTimeInput(new Date());
}
