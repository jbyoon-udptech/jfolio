import { FxRateBar } from "@/components/FxRateBar";

/**
 * Small reference-rate line at the bottom of the page content. The rate is the
 * stored FX data used by the page, never a live provider call.
 */
export function PageFooter({
  baseCurrency,
  referenceTime,
}: {
  /** Base currency of the page data; defaults to the configured base. */
  baseCurrency?: string;
  /** Reference time of the page data, shown as "기준 시각" beside the rate. */
  referenceTime?: string | Date | null;
}) {
  return (
    <footer className="page-footer">
      <FxRateBar baseCurrency={baseCurrency} referenceTime={referenceTime} />
    </footer>
  );
}
