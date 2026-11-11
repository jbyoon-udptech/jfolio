"use client";

import { ALL_PORTFOLIOS_ID } from "@jfolio/shared";
import { apiFetch } from "@/lib/client-fetch";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toLocalDateTimeInput } from "@/lib/format";
import {
  buildPurchaseWithdrawal,
  buildSaleDeposit,
  findCashOptions,
  grossPurchaseCost,
  netSaleProceeds,
} from "@/lib/cash-settlement";
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
  // Controlled so the sell-only "deposit proceeds now" option can follow the
  // selected type and instrument before the form is submitted.
  const [type, setType] = useState("BUY");
  const [instrumentId, setInstrumentId] = useState("");
  // Bumping this remounts the uncontrolled fields after a successful submit
  // without touching the read-only portfolio field.
  const [formVersion, setFormVersion] = useState(0);

  const instrumentOptions = instruments.flatMap((group) => group.options);
  const selectedInstrument = instrumentOptions.find(
    (option) => option.value === instrumentId,
  );
  const cashOption = selectedInstrument?.currency
    ? findCashOptions(instrumentOptions, selectedInstrument.currency)[0]
    : undefined;

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
    // Only rendered for BUY/SELL, and disabled when no matching cash asset exists.
    const settleCash =
      (body.type === "BUY" || body.type === "SELL") &&
      data.get("settleCash") === "on";

    try {
      await postTransaction(body);
      setFormVersion((version) => version + 1);
      setType("BUY");
      setInstrumentId("");
      router.refresh();

      // A trade never moves cash by itself: either create the matching
      // DEPOSIT/WITHDRAWAL right away (the opt-in checkbox) or, for a SELL,
      // offer it as a follow-up form.
      const instrument = instrumentOptions.find(
        (option) => option.value === body.instrumentId,
      );
      if (body.type !== "SELL" && body.type !== "BUY") {
        setMessage("거래가 등록되었습니다.");
        return;
      }
      if (!instrument?.currency) {
        setMessage("거래가 등록되었습니다.");
        return;
      }

      const cashOptions = findCashOptions(instrumentOptions, instrument.currency);
      const cash = settleCash ? cashOptions[0] : undefined;

      if (body.type === "SELL") {
        const amount = netSaleProceeds(body.quantity, body.price, body.fee);
        if (amount <= 0) {
          setMessage("거래가 등록되었습니다.");
          return;
        }

        const settlementProps: Settlement = {
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
          cashOptions,
        };
        if (!cash) {
          setSettlement(settlementProps);
          setMessage("거래가 등록되었습니다.");
          return;
        }

        try {
          await postTransaction(
            buildSaleDeposit({
              portfolioId: body.portfolioId,
              cashInstrumentId: cash.value,
              amount,
              timestamp: body.timestamp,
              memo: `${instrument.label} 매도 대금`,
            }),
          );
          setMessage("거래가 등록되고 매도 대금이 현금으로 입금되었습니다.");
        } catch (depositErr) {
          // The SELL itself succeeded, so surface the failure without losing it
          // and fall back to the manual prompt the user can retry.
          setMessage("거래가 등록되었습니다.");
          setError(
            `매도 대금 입금 실패: ${
              depositErr instanceof Error ? depositErr.message : "알 수 없는 오류"
            }`,
          );
          setSettlement(settlementProps);
        }
        return;
      }

      // BUY fees are part of the cost basis, so the withdrawal covers them.
      const cost = grossPurchaseCost(body.quantity, body.price, body.fee);
      if (cost <= 0 || !cash) {
        setMessage("거래가 등록되었습니다.");
        return;
      }

      try {
        await postTransaction(
          buildPurchaseWithdrawal({
            portfolioId: body.portfolioId,
            cashInstrumentId: cash.value,
            amount: cost,
            timestamp: body.timestamp,
            memo: `${instrument.label} 매수 대금`,
          }),
        );
        setMessage("거래가 등록되고 매수 대금이 현금에서 인출되었습니다.");
      } catch (withdrawalErr) {
        // The BUY itself succeeded; tell the user so they can record the
        // withdrawal manually instead of retrying the purchase.
        setMessage("거래가 등록되었습니다.");
        setError(
          `매수 대금 인출 실패: ${
            withdrawalErr instanceof Error ? withdrawalErr.message : "알 수 없는 오류"
          }. 거래 내역에서 WITHDRAWAL 거래를 직접 추가하세요.`,
        );
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
            <select
              name="instrumentId"
              required
              value={instrumentId}
              onChange={(event) => setInstrumentId(event.target.value)}
            >
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
            <select
              name="type"
              required
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              {TRANSACTION_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          {type === "BUY" || type === "SELL" ? (
            <div
              style={{
                gridColumn: "1 / -1",
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  name="settleCash"
                  style={{ width: "auto" }}
                  disabled={!cashOption}
                />
                {type === "SELL"
                  ? "매도 대금을 현금으로 바로 입금"
                  : "매수 대금을 현금에서 바로 인출"}
              </label>
              <span className="muted" style={{ fontSize: 12 }}>
                {cashOption
                  ? type === "SELL"
                    ? `${cashOption.label}에 순수령액을 DEPOSIT 거래로 함께 등록합니다.`
                    : `${cashOption.label}에서 매수 금액(수수료 포함)을 WITHDRAWAL 거래로 함께 등록합니다.`
                  : selectedInstrument?.currency
                    ? `${selectedInstrument.currency} 현금 자산이 없어 사용할 수 없습니다.`
                    : "자산을 선택하면 사용할 수 있습니다."}
              </span>
            </div>
          ) : null}
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
            <input type="number" name="price" step="any" />
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

/** POST a transaction through the Next.js proxy and throw on failure. */
async function postTransaction(body: unknown): Promise<void> {
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
}
