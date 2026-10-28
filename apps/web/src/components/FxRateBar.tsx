import { api, safe } from "@/lib/api";
import { formatCurrency, formatDateTime, formatPrice } from "@/lib/format";

/**
 * Global reference-rate line shown directly below the page header bar on every
 * authenticated page. The rate is stored FX data, never a live provider call.
 */
export async function FxRateBar({
  baseCurrency,
  referenceTime,
}: {
  /** Base currency of the page data; defaults to the configured base. */
  baseCurrency?: string;
  /**
   * Reference time of the page data. When present it replaces the FX quote
   * timestamp so the header shows a single "기준 시각" line.
   */
  referenceTime?: string | Date | null;
}) {
  const result = await safe(() => api.referenceFxRate({ baseCurrency }));
  const data = result.data;
  const hasRate =
    data !== null &&
    data.rate !== null &&
    data.baseCurrency !== data.referenceCurrency;

  // Large base-currency rates (e.g. KRW) read best without minor units; small
  // inverse rates (e.g. USD per KRW) need adaptive precision.
  const rate =
    data && hasRate && data.rate !== null
      ? Math.abs(data.rate) < 1
        ? formatPrice(data.rate, data.baseCurrency)
        : formatCurrency(data.rate, data.baseCurrency)
      : null;
  // Fall back to the quote timestamp on pages without a page-level reference
  // time, but do not label that older timestamp as the page's "기준 시각".
  const time = referenceTime ?? data?.timestamp ?? null;

  // Without an explicit page reference time the bar only exists to show a
  // usable rate, so keep it hidden when there is no conversion to display.
  if (!referenceTime && !hasRate) return null;
  if (!data && !time) return null;

  return (
    <div className="fx-rate-bar">
      {rate && data ? (
        <span>
          기준 통화 {data.baseCurrency}({rate}/{data.referenceCurrency})
        </span>
      ) : data ? (
        <span>기준 통화 {data.baseCurrency}</span>
      ) : null}
      {time ? (
        <span>
          {referenceTime ? "기준 시각 " : null}
          <time dateTime={time instanceof Date ? time.toISOString() : time}>
            {formatDateTime(time)}
          </time>
        </span>
      ) : null}
    </div>
  );
}
