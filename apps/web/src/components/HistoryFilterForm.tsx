"use client";

import { useRouter } from "next/navigation";
import { useTransition, type FormEvent } from "react";

const CURRENCIES = ["KRW", "USD", "JPY", "EUR"];
const FIELDS = ["from", "to", "baseCurrency", "interval", "asOf"] as const;

/**
 * History filters submit through the client router instead of a native GET so
 * Next.js can show the route-level loading progress bar while the chart data
 * loads. Without this, a full document navigation leaves the old page frozen.
 */
export function HistoryFilterForm({
  fromDate,
  toDate,
  baseCurrency,
  interval,
  asOfDate,
  portfolioId,
}: {
  fromDate: string;
  toDate: string;
  baseCurrency: string;
  interval: "daily" | "hourly";
  asOfDate: string;
  portfolioId?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const field of FIELDS) {
      const value = formData.get(field);
      if (typeof value === "string" && value) params.set(field, value);
    }
    if (portfolioId) params.set("portfolioId", portfolioId);
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `/history?${query}` : "/history");
    });
  }

  return (
    <form
      className="card"
      style={{ marginBottom: 16 }}
      onSubmit={handleSubmit}
      aria-busy={isPending}
    >
      <div className="form-grid">
        <label>
          시작일
          <input type="date" name="from" defaultValue={fromDate} />
        </label>
        <label>
          종료일
          <input type="date" name="to" defaultValue={toDate} />
        </label>
        <label>
          기준 통화
          <select name="baseCurrency" defaultValue={baseCurrency}>
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </label>
        <label>
          간격
          <select name="interval" defaultValue={interval}>
            <option value="daily">일별</option>
            <option value="hourly">시간별</option>
          </select>
        </label>
        <label>
          조회 기준일
          <input type="date" name="asOf" defaultValue={asOfDate} />
        </label>
        <button type="submit" className="primary" disabled={isPending}>
          {isPending ? "조회 중..." : "조회"}
        </button>
      </div>
    </form>
  );
}
