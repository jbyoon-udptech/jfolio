import type { HistoryPoint } from "@/lib/types";
import { formatCurrency } from "@/lib/format";

const WIDTH = 800;
const PAD = 10;

/**
 * UI-004: a value-over-time chart that never interpolates across missing data.
 * Points whose `totalAssetValue` is null break the line into separate segments
 * so gaps are visible instead of being smoothed over.
 */
export function LineChart({
  points,
  currency,
  height = 220,
}: {
  points: HistoryPoint[];
  currency: string;
  height?: number;
}) {
  const finite = points
    .map((p) => p.totalAssetValue)
    .filter((v): v is number => v !== null && Number.isFinite(v));

  if (finite.length === 0) {
    return <div className="empty">표시할 데이터가 없습니다. (평가 불가 구간)</div>;
  }

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const range = max - min || Math.max(Math.abs(max), 1) * 0.01;
  const stepX = points.length > 1 ? (WIDTH - PAD * 2) / (points.length - 1) : 0;

  const segments: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [];
  points.forEach((point, index) => {
    if (point.totalAssetValue === null || !Number.isFinite(point.totalAssetValue)) {
      if (current.length > 0) segments.push(current);
      current = [];
      return;
    }
    const x = PAD + index * stepX;
    const y = PAD + (1 - (point.totalAssetValue - min) / range) * (height - PAD * 2);
    current.push({ x, y });
  });
  if (current.length > 0) segments.push(current);

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${height}`} className="chart" preserveAspectRatio="none">
        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1={PAD}
            x2={WIDTH - PAD}
            y1={PAD + t * (height - PAD * 2)}
            y2={PAD + t * (height - PAD * 2)}
            stroke="var(--border)"
            strokeWidth={1}
          />
        ))}
        {segments.map((segment, index) =>
          segment.length > 1 ? (
            <polyline
              key={index}
              points={segment.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2}
            />
          ) : (
            <circle
              key={index}
              cx={segment[0]?.x}
              cy={segment[0]?.y}
              r={2.5}
              fill="var(--accent)"
            />
          ),
        )}
      </svg>
      <div className="toolbar" style={{ justifyContent: "space-between", marginTop: 6 }}>
        <span className="muted">{formatCurrency(min, currency)}</span>
        <span className="muted">{formatCurrency(max, currency)}</span>
      </div>
    </div>
  );
}
