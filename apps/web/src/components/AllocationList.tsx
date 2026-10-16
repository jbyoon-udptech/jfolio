import type { AllocationSlice } from "@/lib/types";
import { formatCurrency, formatWeight } from "@/lib/format";

export function AllocationList({
  slices,
  currency,
}: {
  slices: AllocationSlice[];
  currency: string;
}) {
  if (slices.length === 0) {
    return <div className="empty">표시할 배분 데이터가 없습니다.</div>;
  }
  return (
    <div>
      {slices.map((slice) => (
        <div className="alloc-row" key={slice.key}>
          <span>{slice.key}</span>
          <div className="alloc-track">
            <div
              className="bar"
              style={{ width: `${Math.max(0, Math.min(100, slice.weight))}%` }}
            />
          </div>
          <span className="num" style={{ textAlign: "right", fontSize: 12 }}>
            {formatWeight(slice.weight)}
            <div className="muted" style={{ fontSize: 11 }}>
              {formatCurrency(slice.marketValueBase, currency)}
            </div>
          </span>
        </div>
      ))}
    </div>
  );
}
